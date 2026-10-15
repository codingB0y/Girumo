import "server-only";

import { abrir, impressaoDaChave, selar } from "@/lib/security/secret-box";
import { contextoDoToken, type ConexaoBling } from "@/lib/stores/bling-conexoes";

import { ErroOAuthBling, type TokensBling } from "./oauth";
import {
  agoraMs,
  cabeAChamada,
  fimDaTrava,
  iso,
  mensagemDe,
  ParadaDaRodada,
  reconectar,
  resto,
  rotulo,
  tetoDasGravacoes,
  type Execucao,
  type Rodada,
  type TokensAbertos,
} from "./sincronizar-execucao";

/**
 * O par de tokens da loja durante a execução (spec §3 "Token"). O refresh ROTACIONA: renovar mata
 * o usado, então a renovação acontece só com a trava na mão, relê a conexão antes (outro processo
 * pode ter trocado o par), grava conferindo `token_version` e, se outro processo trocou o par antes,
 * vale o do banco. O par novo que o banco não aceita fica em `ex.parNaoGravado` até gravar. A falha
 * que não é recusa deixa a renovação em recuo por 5 min (`token_retry_at`), para todas as execuções.
 */

/** Renova com folga: o access vale 6 h e uma execução longa não pode vencer no meio. */
const RENOVAR_ANTES_MS = 30 * 60_000;
/** Sem como renovar agora (limite global, recuo, Bling fora), o token atual ainda serve se tiver isto de vida. */
const AINDA_SERVE_MS = 2 * 60_000;
/** Renovação que falhou sem ser recusa: nenhuma execução chama o /oauth/token de novo antes disso. */
const RECUO_DA_RENOVACAO_MS = 5 * 60_000;
/**
 * O /oauth/token espera até 15 s, sempre: só começa se esse timeout inteiro cabe (`cabeAChamada`). Abortado
 * depois de o Bling rotacionar, o refresh velho já morreu e o novo se perde (invalid_grant → reconectar).
 */
const TIMEOUT_DA_RENOVACAO_MS = 15_000;
/** Entre as 4 tentativas de gravar o par novo: o velho já morreu no Bling, perder o novo derruba a loja. */
const RECUOS_DA_GRAVACAO_MS = [500, 2_000, 5_000];
/** Recusa definitiva só depois de reler: outro processo pode estar gravando o par que acabou de rotacionar. */
const RELEITURAS_DA_RECUSA_MS = [2_000, 5_000];
const ACESSO_ILEGIVEL = "Não foi possível ler o acesso salvo do Bling.";
const RENOVACAO_RECUSADA = "O Bling recusou a renovação do acesso.";
/** Barrada pelo limite global ou pelo recuo de uma falha do Bling: o texto não culpa nenhum dos dois. */
const RENOVACAO_BARRADA = "O acesso ao Bling não pôde ser renovado agora. A Girumo tenta de novo sozinha.";
/** A renovação que falhou sem ser recusa: o tipo do erro vem depois, entre parênteses. */
const RENOVACAO_FALHOU = "Não foi possível renovar o acesso ao Bling";
const CHAVE_TROCADA = "Falha da Girumo ao ler o acesso ao Bling (não é na sua conta e não precisa reconectar). Já estamos vendo.";

/** null = a cifra não abre (chave trocada, linha adulterada, token faltando). */
function abrirTokens(ex: Execucao, c: ConexaoBling): TokensAbertos | null {
  try {
    const expira = c.accessExpiresAt ? Date.parse(c.accessExpiresAt) : Number.NaN;
    return {
      access: abrir(c.accessTokenEnc ?? "", contextoDoToken(ex.tenantId, "access"), ex.chave),
      refresh: abrir(c.refreshTokenEnc ?? "", contextoDoToken(ex.tenantId, "refresh"), ex.chave),
      expiraEm: Number.isFinite(expira) ? expira : null,
      versao: c.tokenVersion,
    };
  } catch {
    return null;
  }
}

/**
 * Token que não abre não volta a abrir sozinho: só reconectando. A não ser que a chave de cifra
 * tenha mudado (impressão gravada ≠ a de agora): aí o problema é da Girumo, e todas as lojas
 * seriam mandadas reconectar à toa.
 */
export async function tokensDaConexao(ex: Execucao, c: ConexaoBling): Promise<TokensAbertos> {
  const tokens = abrirTokens(ex, c);
  if (tokens) return tokens;
  if (c.keyFp !== null && c.keyFp !== impressaoDaChave(ex.chave)) return chaveTrocada(ex);
  return reconectar(ex, ACESSO_ILEGIVEL);
}

async function chaveTrocada(ex: Execucao): Promise<never> {
  console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: tokens selados com outra chave de cifra (INTEGRATIONS_ENCRYPTION_KEY trocada?)`);
  await ex.deps.conexoes.atualizarConexao(ex.tenantId, { last_error: CHAVE_TROCADA, last_error_at: iso(agoraMs(ex)) });
  throw new ParadaDaRodada("chave");
}

export async function renovarSePreciso(r: Rodada): Promise<void> {
  const { expiraEm } = r.tokens;
  if (expiraEm !== null && expiraEm - agoraMs(r.ex) >= RENOVAR_ANTES_MS) return;
  await renovar(r, false);
}

function aindaServe(r: Rodada): boolean {
  return r.tokens.expiraEm !== null && r.tokens.expiraEm - agoraMs(r.ex) > AINDA_SERVE_MS;
}

/** A versão do banco se ninguém mais trocou o par: a lida antes do par ainda não gravado, ou a do par em mãos. */
function versaoNoBanco(r: Rodada): number {
  return r.ex.parNaoGravado?.versaoLida ?? r.tokens.versao;
}

/**
 * Troca o par. `forcado` = o Bling acabou de recusar o access (401): manter o atual não adianta,
 * então o recuo, o limite global ou uma falha da renovação param a rodada (manter faria o cliente
 * repetir com o token recusado).
 */
export async function renovar(r: Rodada, forcado: boolean): Promise<void> {
  const { ex } = r;
  // Reconexão no meio, ou execução que perdeu a trava: renovar com o refresh daqui mataria o par novo.
  const atual = await conexaoSemOutroPar(r);
  if (!atual) return;
  // Antes do balde global: só conferir o limite já gasta uma das 10 chamadas por minuto de todas as lojas.
  if (emRecuo(atual, agoraMs(ex))) return semRenovar(r, forcado);
  if (!cabeAChamada(fimDaTrava(ex), agoraMs(ex), TIMEOUT_DA_RENOVACAO_MS)) throw new ParadaDaRodada("orcamento");
  if (await ex.deps.limiteTokenGlobal()) return semRenovar(r, forcado);
  let novos: TokensBling;
  try {
    const opcoes = { fetchImpl: ex.deps.fetchImpl, agora: () => agoraMs(ex), timeoutMs: TIMEOUT_DA_RENOVACAO_MS };
    novos = await ex.deps.oauth.renovar(r.tokens.refresh, ex.credenciais, opcoes);
  } catch (e) {
    if (!(e instanceof ErroOAuthBling)) throw e;
    return renovacaoFalhou(r, e, forcado);
  }
  await guardar(r, novos);
  if (avisoDeRenovacao(atual.lastError)) await tirarAvisoDeRenovacao(ex);
}

/** Os avisos de renovação no cartão: a barrada e a que falhou sem ser recusa. */
function avisoDeRenovacao(erro: string | null): boolean {
  return erro === RENOVACAO_BARRADA || erro?.startsWith(`${RENOVACAO_FALHOU} (`) === true;
}

/**
 * Renovou: o aviso de renovação (barrada ou falha) perdeu o motivo e sai do cartão (os outros erros ficam o dia). O
 * banco falhando aqui não para a execução (o par novo pode estar só na memória): o aviso fica, e o log diz.
 */
async function tirarAvisoDeRenovacao(ex: Execucao): Promise<void> {
  try {
    await ex.deps.conexoes.atualizarConexao(ex.tenantId, { last_error: null, last_error_at: null });
  } catch (e) {
    console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: tirar o aviso de renovação do cartão falhou: ${mensagemDe(e)}`);
  }
}

function emRecuo(c: ConexaoBling, agora: number): boolean {
  return c.tokenRetryAt !== null && Date.parse(c.tokenRetryAt) > agora;
}

/**
 * Sem renovar agora (limite global ou recuo): o token atual segue se ainda servir (e o Bling não acabou de
 * recusá-lo). Senão a loja para, e o cartão e o log dizem por quê: parada calada parecia conectada sem vender.
 */
async function semRenovar(r: Rodada, forcado: boolean): Promise<void> {
  if (!forcado && aindaServe(r)) return;
  const { ex } = r;
  console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: renovação barrada (limite global ou recuo) com o token sem servir; a loja para`);
  await ex.deps.conexoes.atualizarConexao(ex.tenantId, { last_error: RENOVACAO_BARRADA, last_error_at: iso(agoraMs(ex)) });
  throw new ParadaDaRodada("limite_token");
}

/** A conexão do banco; null = outro processo trocou o par, e a rodada já segue com o dele. */
async function conexaoSemOutroPar(r: Rodada): Promise<ConexaoBling | null> {
  const atual = await r.ex.deps.conexoes.lerConexao(r.ex.tenantId);
  if (atual?.tokenVersion === versaoNoBanco(r)) return atual;
  await adotar(r, atual);
  return null;
}

/** true = o banco tem outro par (outro processo trocou): ele vale, e a rodada segue com ele. */
export async function adotouOutroPar(r: Rodada): Promise<boolean> {
  return (await conexaoSemOutroPar(r)) === null;
}

/**
 * Falha que não é recusa (Bling fora, limite, resposta torta): recuo de 5 min para todas as execuções,
 * com o motivo no cartão — e na memória da rodada, para a varredura e o histórico que andarem depois tirarem
 * do cartão só o aviso deles, não este. O token que ainda serve segue; senão a execução para por erros.
 */
async function renovacaoFalhou(r: Rodada, e: ErroOAuthBling, forcado: boolean): Promise<void> {
  if (e.tipo === "concessao_invalida") return concessaoInvalida(r);
  const { ex } = r;
  const motivo = `${RENOVACAO_FALHOU} (${e.tipo}).`;
  const agora = agoraMs(ex);
  console.warn(`[bling/sincronizar] ${rotulo(ex.tenantId)}: renovação do token falhou: ${e.tipo}; nova tentativa em 5 min`);
  await ex.deps.conexoes.atualizarConexao(ex.tenantId, {
    token_retry_at: iso(agora + RECUO_DA_RENOVACAO_MS),
    last_error: motivo,
    last_error_at: iso(agora),
  });
  r.conexao = { ...r.conexao, lastError: motivo, lastErrorAt: iso(agora) };
  if (!forcado && aindaServe(r)) return;
  ex.falhas += 1;
  ex.ultimoErro = motivo;
  throw new ParadaDaRodada("erros");
}

/**
 * Recusa definitiva — a não ser que outro processo esteja trocando o par: relê agora, depois de 2 s
 * e de mais 5 s. Sem orçamento para reler, para sem marcar (a próxima execução decide).
 */
async function concessaoInvalida(r: Rodada): Promise<void> {
  if (await adotouOutroPar(r)) return;
  for (const espera of RELEITURAS_DA_RECUSA_MS) {
    if (espera >= resto(r.ex)) throw new ParadaDaRodada("orcamento");
    await r.ex.deps.esperar(espera);
    if (await adotouOutroPar(r)) return;
  }
  return reconectar(r.ex, RENOVACAO_RECUSADA);
}

/** Vale o par do banco (e o que não gravou deixa de valer). Só os tokens: o resto da rodada segue com o que já leu. */
export async function adotar(r: Rodada, atual: ConexaoBling | null): Promise<void> {
  if (!atual || atual.status !== "ativa") throw new ParadaDaRodada(atual?.status === "reconectar" ? "reconectar" : "inativa");
  r.ex.parNaoGravado = null;
  r.tokens = await tokensDaConexao(r.ex, atual);
}

async function guardar(r: Rodada, novos: TokensBling): Promise<void> {
  const { ex } = r;
  const versaoLida = versaoNoBanco(r);
  ex.parNaoGravado = {
    versaoLida,
    selados: {
      accessTokenEnc: selar(novos.accessToken, contextoDoToken(ex.tenantId, "access"), ex.chave),
      refreshTokenEnc: selar(novos.refreshToken, contextoDoToken(ex.tenantId, "refresh"), ex.chave),
      accessExpiresAt: novos.expiraEm,
      keyFp: impressaoDaChave(ex.chave),
    },
  };
  // O par novo já vale e o velho já morreu no Bling: em mãos antes de gravar.
  r.tokens = { access: novos.accessToken, refresh: novos.refreshToken, expiraEm: novos.expiraEm.getTime(), versao: versaoLida + 1 };
  // Outro processo trocou o par antes (reconexão ou desconexão no meio): vale o do banco.
  if ((await gravarComRecuo(ex)) === false) await adotar(r, await ex.deps.conexoes.lerConexao(ex.tenantId));
}

/**
 * Até 4 tentativas (0,5 s, 2 s, 5 s entre elas) até o teto das gravações (o fim da trava, não o do
 * orçamento; nunca a menos de 2 s da morte da função): o par já vale no Bling e o velho já morreu.
 * null = segue pendente.
 */
async function gravarComRecuo(ex: Execucao): Promise<boolean | null> {
  let gravou = await gravarParPendente(ex);
  for (const espera of RECUOS_DA_GRAVACAO_MS) {
    if (gravou !== null || agoraMs(ex) + espera >= tetoDasGravacoes(ex)) return gravou;
    await ex.deps.esperar(espera);
    gravou = await gravarParPendente(ex);
  }
  return gravou;
}

/**
 * Tenta gravar o par que ficou só na memória. true = gravou (ou não havia); false = outro processo
 * trocou a versão (o par do banco vale; quem chama adota); null = o banco falhou de novo e o par
 * segue pendente — a execução continua com ele em mãos.
 */
export async function gravarParPendente(ex: Execucao): Promise<boolean | null> {
  const par = ex.parNaoGravado;
  if (!par) return true;
  try {
    const gravou = await ex.deps.conexoes.salvarTokensRenovados(ex.tenantId, par.versaoLida, par.selados);
    ex.parNaoGravado = null;
    return gravou;
  } catch (e) {
    console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: gravar o token renovado falhou: ${mensagemDe(e)}`);
    return null;
  }
}

/**
 * Antes de cada lote: grava o par pendente e decide pelo banco. Outro par no banco (reconexão, ou
 * a gravação que achou outra versão) é adotado; o par em mãos que o banco ainda não aceitou nunca
 * é trocado pelo velho do banco só porque a versão difere.
 */
export async function acertarTokens(r: Rodada, atual: ConexaoBling, gravou: boolean | null): Promise<void> {
  if (gravou === false || atual.tokenVersion !== versaoNoBanco(r)) await adotar(r, atual);
}
