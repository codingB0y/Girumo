import "server-only";

import type { ConexaoBling } from "@/lib/stores/bling-conexoes";
import type { LinhaPedidoBling } from "@/lib/stores/bling-pedidos";

import { criarClienteBling, ErroBling, type ClienteBling } from "./cliente";
import { depsDeProducao, type DepsBling } from "./deps";
import { contextoDaLoja, processarPedido, recarregarSituacoes, type ContextoLoja } from "./processar-pedido";
import { atualizarCanais } from "./sincronizar-canais";
import {
  agoraMs,
  comoParada,
  fimDaTrava,
  iso,
  mensagemDe,
  MINIMO_PARA_UMA_LINHA_MS,
  ParadaDaRodada,
  reagendar,
  registrarSucesso,
  resto,
  rotulo,
  soNaPrimeiraVez,
  TAMANHO_DO_ERRO,
  tetoDasGravacoes,
  tratarErro,
  type Execucao,
  type Gatilho,
  type Parada,
  type Rodada,
} from "./sincronizar-execucao";
import { acertarTokens, adotouOutroPar, gravarParPendente, renovar, renovarSePreciso, tokensDaConexao } from "./sincronizar-token";
import { importarHistorico, varrer } from "./sincronizar-varredura";

export type { Gatilho, Parada } from "./sincronizar-execucao";

/**
 * O motor de uma loja (spec §3 "Abordagem"): trava → token → situações → [cron e conexão:
 * varredura e histórico] → fila até o orçamento acabar → solta a trava; sobrou pendente vencido e
 * tempo, outra rodada (até 3). Nunca lança: roda no `after()` do aviso e do retorno, e o cron
 * passa para a próxima loja.
 */

export type Resultado = {
  tenantId: string;
  trava: boolean;
  processados: number;
  falhas: number;
  varredura: number;
  historico: number;
  parou?: Parada;
};

const RODADAS = 3;
const TRAVA_MINIMA_S = 10;
const TRAVA_MAXIMA_S = 600;
/** Outra rodada só com tempo: menos que isso, o próximo aviso ou cron pega o resto. */
const FOLGA_PARA_OUTRA_RODADA_MS = 10_000;
/** O Bling para a 5 s do fim: dá para gravar o que chegou e soltar a trava. */
const FOLGA_DO_BLING_MS = 5_000;
const LOTE_DA_FILA = 20;
const SITUACOES_VALEM_MS = 24 * 3_600_000;
/** Paradas que não pedem atenção de ninguém: sem as variáveis, loja desligada, orçamento acabou. */
const PARADAS_DE_ROTINA: ReadonlySet<Parada> = new Set(["indisponivel", "inativa", "orcamento"]);

/**
 * `orcamentoMs`: quanto a execução trabalha. `vidaMs`: quanto resta à função que a roda (o `maxDuration`
 * da rota menos o que ela já gastou) — a chamada com efeito que não termina antes disso nem começa.
 */
export async function sincronizarLoja(
  tenantId: string,
  gatilho: Gatilho,
  orcamentoMs: number,
  vidaMs: number,
  deps: DepsBling = depsDeProducao(),
): Promise<Resultado> {
  const credenciais = deps.oauth.credenciais();
  const chave = deps.cifra.chave();
  const vazio = { tenantId, trava: false, processados: 0, falhas: 0, varredura: 0, historico: 0 };
  // Sem as variáveis do Bling a integração está desligada: nem o banco é tocado.
  if (!credenciais || !chave) return { ...vazio, parou: "indisponivel" };
  const agora = deps.agora().getTime();
  const prazos = { fim: agora + orcamentoMs, orcamento: orcamentoMs, morte: agora + vidaMs };
  const novos = { falhasSeguidas: 0, historicoTerminou: false, listagemRespondeu: false, ultimoErro: null, renovouPor401: false, parNaoGravado: null };
  const ex: Execucao = { ...vazio, ...novos, ...prazos, gatilho, deps, credenciais, chave, podeRelerSituacoes: soNaPrimeiraVez() };
  try {
    await rodadas(ex);
  } catch (e) {
    console.error(`[bling/sincronizar] ${rotulo(tenantId)}: execução interrompida: ${mensagemDe(e)}`);
    ex.falhas += 1;
    ex.ultimoErro = mensagemDe(e);
    ex.parou = "erros";
  }
  // O refresh velho já morreu no Bling: sem o novo no banco, a próxima execução não renova.
  if (ex.parNaoGravado) {
    console.error(`[bling/sincronizar] ${rotulo(tenantId)}: o par novo de tokens não foi gravado; a próxima execução vai precisar de reconexão`);
  }
  await anotarErros(ex);
  await redeDasListas(ex);
  resumir(ex);
  const { trava, processados, falhas, varredura, historico, parou } = ex;
  return { tenantId, trava, processados, falhas, varredura, historico, ...(parou ? { parou } : {}) };
}

async function rodadas(ex: Execucao): Promise<void> {
  for (let n = 0; n < RODADAS; n += 1) {
    const dono = ex.deps.novoId();
    // Ocupada: quem tem a trava drena a fila (o aviso que chegou agora entra no lote dele).
    if (!(await ex.deps.conexoes.pegarTrava(ex.tenantId, dono, segundosDaTrava(ex)))) return;
    ex.trava = true;
    try {
      await umaRodada(ex, dono, n === 0);
    } finally {
      await soltar(ex, dono);
    }
    // Par renovado que o banco não aceitou: outra rodada abriria o par velho (e morto) do banco.
    if (ex.parou || ex.parNaoGravado || resto(ex) <= FOLGA_PARA_OUTRA_RODADA_MS) return;
    if (!(await ex.deps.pedidos.existePendenteVencido(ex.tenantId, ex.deps.agora()))) return;
  }
}

function segundosDaTrava(ex: Execucao): number {
  return Math.min(Math.max(Math.ceil((fimDaTrava(ex) - agoraMs(ex)) / 1000), TRAVA_MINIMA_S), TRAVA_MAXIMA_S);
}

async function soltar(ex: Execucao, dono: string): Promise<void> {
  // Última chance do par renovado: sem a trava, outra execução renovaria com o refresh velho do banco.
  await gravarParPendente(ex);
  try {
    await ex.deps.conexoes.soltarTrava(ex.tenantId, dono);
  } catch (e) {
    // A trava vence sozinha (`lease_until`): falhar aqui só atrasa a próxima execução.
    console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: soltar a trava falhou: ${mensagemDe(e)}`);
  }
}

async function umaRodada(ex: Execucao, dono: string, primeira: boolean): Promise<void> {
  let rodada: Rodada | null = null;
  try {
    rodada = await abrirRodada(ex, dono);
    await passos(rodada, primeira);
  } catch (e) {
    const parada = comoParada(e);
    if (!parada) throw e;
    ex.parou = parada.motivo;
  } finally {
    if (rodada) await gravarUltimaVenda(rodada);
  }
}

/** A conexão como está agora; fora de `ativa` (reconectar, desligada no cartão) a rodada para. */
async function conexaoAtiva(ex: Execucao): Promise<ConexaoBling> {
  const c = await ex.deps.conexoes.lerConexao(ex.tenantId);
  if (c?.status === "ativa") return c;
  throw new ParadaDaRodada(c?.status === "reconectar" ? "reconectar" : "inativa");
}

async function abrirRodada(ex: Execucao, dono: string): Promise<Rodada> {
  const conexao = await conexaoAtiva(ex);
  const r: Rodada = { ex, dono, conexao, tokens: await tokensDaConexao(ex, conexao), ultimaVendaLida: conexao.lastSaleAt };
  await renovarSePreciso(r);
  return r;
}

async function passos(r: Rodada, primeira: boolean): Promise<void> {
  const cliente = clienteDaRodada(r);
  await atualizarSituacoes(r, cliente);
  await atualizarCanais(r, cliente);
  // Varredura e histórico só no cron e na conexão: o aviso drena o que ele mesmo marcou.
  if (primeira && r.ex.gatilho !== "aviso") {
    await semSegurarAFila(r, () => varrer(r, cliente));
    await semSegurarAFila(r, () => importarHistorico(r, cliente));
  }
  await drenar(r, cliente);
}

/** Erro da varredura ou do histórico (banco, Bling) conta, mas não segura a fila: a drenagem roda mesmo assim. */
async function semSegurarAFila(r: Rodada, passo: () => Promise<void>): Promise<void> {
  try {
    await passo();
  } catch (e) {
    await tratarErro(r, e);
  }
}

function clienteDaRodada(r: Rodada): ClienteBling {
  const { deps } = r.ex;
  return criarClienteBling({
    token: async () => r.tokens.access,
    renovar: () => renovarPor401(r),
    fetchImpl: deps.fetchImpl,
    esperar: deps.esperar,
    agora: () => deps.agora().getTime(),
    prazo: r.ex.fim - FOLGA_DO_BLING_MS,
  });
}

/**
 * 401: renova (o cliente repete com o token novo). Uma vez por execução: o 401 que volta depois de
 * renovar é incidente do Bling ou de proxy, e renovar a cada pedido gastaria o balde global de
 * /oauth/token (10/min, todas as lojas). Da segunda em diante, uma leitura da conexão antes: a dona
 * que reconectou no meio do lote deixou o par novo no banco, e é com ele que o cliente repete. Sem
 * par novo, vira transitório, sem chamar o /oauth/token.
 */
async function renovarPor401(r: Rodada): Promise<string> {
  if (!r.ex.renovouPor401) {
    r.ex.renovouPor401 = true;
    await renovar(r, true);
    return r.tokens.access;
  }
  if (await adotouOutroPar(r)) return r.tokens.access;
  throw new ErroBling("transitorio", 401, "Bling: 401 de novo depois de renovar nesta execução");
}

/**
 * Situações nunca lidas (hora nula: conexão nova, reconexão) ou com mais de 24 h: recarrega. Pela hora, não
 * pela lista: a vazia de um módulo de vendas não reconhecido também espera as 24 h. Falhou, segue com as que
 * tem (o erro conta).
 */
async function atualizarSituacoes(r: Rodada, cliente: ClienteBling): Promise<void> {
  const { situationsAt } = r.conexao;
  const lidasHa = situationsAt ? agoraMs(r.ex) - Date.parse(situationsAt) : Number.POSITIVE_INFINITY;
  if (lidasHa <= SITUACOES_VALEM_MS) return;
  try {
    r.conexao = await recarregarSituacoes({ tenantId: r.ex.tenantId, conexao: r.conexao, cliente, deps: r.ex.deps });
    await registrarSucesso(r);
  } catch (e) {
    await tratarErro(r, e);
  }
}

/** Pendentes vencidos em lotes de 20, até a fila esvaziar ou o orçamento acabar. */
async function drenar(r: Rodada, cliente: ClienteBling): Promise<void> {
  const { ex } = r;
  const ctx = contextoDaLoja(ex.tenantId, r.conexao, cliente, ex.deps, {
    fimDaTrava: fimDaTrava(ex),
    tetoDasGravacoes: tetoDasGravacoes(ex),
    podeRelerSituacoes: ex.podeRelerSituacoes,
  });
  for (;;) {
    if (resto(ex) < MINIMO_PARA_UMA_LINHA_MS) throw new ParadaDaRodada("orcamento");
    await renovarTrava(r);
    const linhas = await ex.deps.pedidos.listarPendentes(ex.tenantId, ex.deps.agora(), LOTE_DA_FILA);
    if (linhas.length === 0) return;
    // Lista ANTES de reler a conexão: o Salvar do cartão grava o ajuste antes de reabrir os pedidos, então a linha
    // listada depois da reabertura sempre vê o ajuste novo; a listada antes tem o `updated_at` velho, a reabertura o
    // troca e a gravação guardada falha — ela volta à fila e é refeita com o ajuste novo.
    await releConexao(r);
    for (const linha of linhas) {
      if (resto(ex) < MINIMO_PARA_UMA_LINHA_MS) throw new ParadaDaRodada("orcamento");
      await processarLinha(r, ctx, linha);
    }
  }
}

/**
 * A cada lote, com o mesmo dono (`bling_claim` renova): false = a trava venceu e outra execução a tomou — ou a loja
 * saiu de `ativa` (desligada no cartão, a reconectar), que o `bling_claim` também recusa: aí a parada diz qual.
 */
async function renovarTrava(r: Rodada): Promise<void> {
  if (await r.ex.deps.conexoes.pegarTrava(r.ex.tenantId, r.dono, segundosDaTrava(r.ex))) return;
  await conexaoAtiva(r.ex);
  throw new ParadaDaRodada("trava");
}

/**
 * A cada lote, depois de listá-lo (ver `drenar`): o cartão pode mudar os ajustes (situações de venda, valor
 * alto, Meta) e reabrir pedidos no meio da execução; drenar com os ajustes velhos marcaria como feito o que
 * mudou. O par renovado que não gravou tenta de novo antes de decidir pelo banco, e os tokens só
 * reabrem se outro processo trocou o par. Da memória ficam a última venda (gravada no fim da
 * rodada) e a hora das situações (evita reler o Bling a cada lote).
 */
async function releConexao(r: Rodada): Promise<void> {
  const gravou = await gravarParPendente(r.ex);
  const atual = await conexaoAtiva(r.ex);
  await acertarTokens(r, atual, gravou);
  r.conexao = {
    ...atual,
    lastSaleAt: maisRecente(atual.lastSaleAt, r.conexao.lastSaleAt),
    situationsAt: maisRecente(atual.situationsAt, r.conexao.situationsAt),
    salesChannelsAt: maisRecente(atual.salesChannelsAt, r.conexao.salesChannelsAt),
  };
}

function maisRecente(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

async function processarLinha(r: Rodada, ctx: ContextoLoja, linha: LinhaPedidoBling): Promise<void> {
  try {
    const { conexao, adiado } = await processarPedido({ ...ctx, conexao: r.conexao }, linha);
    r.conexao = conexao;
    // Situação que o Bling ainda não lista: espera no recuo normal, sem contar como falha da loja (muitos
    // pedidos assim abririam o disjuntor ou parariam a execução por erros).
    if (adiado !== null) return await reagendar(r, linha, adiado);
    r.ex.processados += 1;
    await registrarSucesso(r);
  } catch (e) {
    // Parada (reconectar no meio, orçamento) não é falha do pedido: ele fica pendente como estava.
    const parada = comoParada(e);
    if (parada) throw parada;
    await reagendar(r, linha, e);
    await tratarErro(r, e, linha.blingOrderId);
  }
}

/** Uma gravação por rodada, só se viu venda mais nova (o cartão mostra "última venda há N min"). */
async function gravarUltimaVenda(r: Rodada): Promise<void> {
  const vista = r.conexao.lastSaleAt;
  if (!vista || vista === r.ultimaVendaLida) return;
  try {
    await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, { last_sale_at: vista });
  } catch (e) {
    console.error(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: última venda: ${mensagemDe(e)}`);
  }
}

/** Execução que parou por erros deixa no cartão quantos foram e o último (o cartão mostra por um tempo). */
async function anotarErros(ex: Execucao): Promise<void> {
  if (ex.parou !== "erros" || ex.ultimoErro === null) return;
  await anotarNoCartao(ex, `${ex.falhas} erro(s) nesta sincronização; o último: ${ex.ultimoErro}`);
}

/** O último erro no cartão; se nem isso grava, fica o log. */
async function anotarNoCartao(ex: Execucao, texto: string): Promise<void> {
  try {
    await ex.deps.conexoes.atualizarConexao(ex.tenantId, { last_error: texto.slice(0, TAMANHO_DO_ERRO), last_error_at: iso(agoraMs(ex)) });
  } catch (e) {
    console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: gravar o último erro falhou: ${mensagemDe(e)}`);
  }
}

/** Uma linha por execução que falhou ou parou fora da rotina: a loja, o gatilho e o que aconteceu. */
function resumir(ex: Execucao): void {
  if (ex.falhas === 0 && (!ex.parou || PARADAS_DE_ROTINA.has(ex.parou))) return;
  console.warn(
    `[bling/sincronizar] ${rotulo(ex.tenantId)}: gatilho ${ex.gatilho}, parou ${ex.parou ?? "-"}, ${ex.falhas} falha(s), ${ex.processados} processado(s)`,
  );
}

/**
 * Rede de segurança das listas (spec §3): a loja toda depois de cron/conexão que processou algo, e no
 * fim do histórico. A falha vai ao cartão: as listas (e os CSVs do Meta) ficariam velhas sem ninguém ver.
 */
async function redeDasListas(ex: Execucao): Promise<void> {
  if (!ex.historicoTerminou && (ex.gatilho === "aviso" || ex.processados === 0)) return;
  try {
    await ex.deps.contatos.recalcularListas(ex.tenantId);
  } catch (e) {
    console.error(`[bling/sincronizar] ${rotulo(ex.tenantId)}: listas da loja: ${mensagemDe(e)}`);
    await anotarNoCartao(ex, `Listas: ${mensagemDe(e)}`);
  }
}
