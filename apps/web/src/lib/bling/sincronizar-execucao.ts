import "server-only";

import type { ConexaoBling, TokensSelados } from "@/lib/stores/bling-conexoes";
import type { LinhaPedidoBling } from "@/lib/stores/bling-pedidos";

import { ErroBling } from "./cliente";
import type { DepsBling } from "./deps";
import type { CredenciaisBling } from "./oauth";

/**
 * Estado de uma execução do motor e a regra de erro dela (spec §3 "Cliente HTTP"), num lugar só
 * para situações, varredura, histórico e fila: sem escopo, cota do dia, disjuntor de 5 falhas
 * seguidas e teto de 20 erros por execução (longe dos 300 em 10 s do bloqueio de IP). Não importa
 * os `processar-*`: eles importam daqui (a parada, o rótulo do log, a nova tentativa).
 */

export type Gatilho = "aviso" | "cron" | "conexao";
export type Parada =
  | "indisponivel"
  | "inativa"
  | "reconectar"
  | "pausa"
  | "escopo"
  | "orcamento"
  | "erros"
  | "limite_token"
  | "trava"
  | "chave";

/** Controle de fluxo, não falha: termina a rodada com o motivo (que vira `Resultado.parou`). */
export class ParadaDaRodada extends Error {
  readonly motivo: Parada;

  constructor(motivo: Parada) {
    super(`bling: rodada parada (${motivo})`);
    this.name = "ParadaDaRodada";
    this.motivo = motivo;
  }
}

/** O par renovado que o banco ainda não aceitou: a versão lida antes da renovação e o par cifrado. */
export type ParNaoGravado = { versaoLida: number; selados: TokensSelados };

/** Nasce em `sincronizarLoja` e só os módulos `sincronizar-*` mexem nele. */
export type Execucao = {
  readonly tenantId: string;
  readonly gatilho: Gatilho;
  readonly deps: DepsBling;
  readonly credenciais: CredenciaisBling;
  readonly chave: Buffer;
  /** Fim do orçamento, no relógio de `deps.agora`. */
  readonly fim: number;
  /** O orçamento inteiro (ms): o `fim` sozinho não diz quanto era, e a reserva da fila é a metade dele. */
  readonly orcamento: number;
  /** Quando a função morre (o `maxDuration` da rota), no relógio de `deps.agora`: nada que mexe fora pode estar no ar depois. */
  readonly morte: number;
  trava: boolean;
  processados: number;
  falhas: number;
  varredura: number;
  historico: number;
  parou?: Parada;
  /** Limite e transitório seguidos: o 5º abre o disjuntor. Sucesso zera. */
  falhasSeguidas: number;
  historicoTerminou: boolean;
  /**
   * Uma listagem do Bling (página da varredura ou do histórico) respondeu nesta execução: só com ela a falha da
   * página da frente do histórico conta para a válvula — numa queda total do Bling a página não tem culpa.
   */
  listagemRespondeu: boolean;
  /** A mensagem do último erro contado: a execução que para por erros a deixa no cartão. */
  ultimoErro: string | null;
  /** 401 depois de renovar é incidente do Bling, não concessão morta: uma renovação forçada por execução. */
  renovouPor401: boolean;
  /** O refresh velho já morreu no Bling: este par vale e precisa chegar ao banco antes de a execução acabar. */
  parNaoGravado: ParNaoGravado | null;
  /** true só na primeira vez: o pedido em situação desconhecida relê as situações uma vez por execução. */
  readonly podeRelerSituacoes: () => boolean;
};

export type TokensAbertos = { access: string; refresh: string; expiraEm: number | null; versao: number };

/** Uma rodada (com a trava na mão): a conexão como está agora e o par de tokens vigente. */
export type Rodada = {
  readonly ex: Execucao;
  /** Dono da trava: renovada a cada lote com ele (`bling_claim` renova para o mesmo dono). */
  readonly dono: string;
  conexao: ConexaoBling;
  tokens: TokensAbertos;
  /** A `last_sale_at` lida no começo: a rodada só grava se viu venda mais nova. */
  readonly ultimaVendaLida: string | null;
};

const UMA_HORA_MS = 3_600_000;
const MAX_FALHAS = 20;
const FALHAS_PARA_PAUSAR = 5;
const PAUSA_BASE_MS = 15 * 60_000;
const PAUSA_MAXIMA_MS = 2 * UMA_HORA_MS;
/** A cota de 120 mil por dia não volta recuando: uma hora de pausa e tenta de novo. */
const PAUSA_DA_COTA_MS = UMA_HORA_MS;
/** Teto de todo texto de erro que vai para o banco (`last_error`, `meta_error`): o cartão mostra inteiro. */
export const TAMANHO_DO_ERRO = 300;
/**
 * Uma linha da fila só começa com 20 s pela frente: dois GETs (até 15 s cada, o prazo encolhe), o
 * pedido em `orders` e o Meta. Começar com menos deixaria a Vercel matar a função no meio dela.
 */
export const MINIMO_PARA_UMA_LINHA_MS = 20_000;
/** A trava dura o orçamento mais esta folga: quem morre no meio libera sozinho quando ela vence. */
const FOLGA_DA_TRAVA_S = 30;
/** O que sobra para gravar o que uma chamada de fora fez, antes do fim da trava e da morte da função. */
const FOLGA_DA_GRAVACAO_MS = 2_000;
/** Intervalos da nova tentativa (spec §3), pela tentativa que acabou de falhar (1..5). */
const RECUOS_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 2 * UMA_HORA_MS, 12 * UMA_HORA_MS];
const SEM_ESCOPO = "O app do Bling está sem permissão para ler pedidos ou contatos.";

export function agoraMs(ex: Execucao): number {
  return ex.deps.agora().getTime();
}

export function resto(ex: Execucao): number {
  return ex.fim - agoraMs(ex);
}

/**
 * Até quando a trava segura a loja: o fim do orçamento mais a folga, e nunca além da vida da função
 * (morta, ela não grava mais nada, e a trava só atrasaria a próxima execução). É o teto de quem mexe fora
 * com efeito (pedido em `orders`, evento aceito pelo Meta, par de tokens novo): parar no fim do orçamento
 * perderia a gravação, e a volta seguinte repetiria o efeito; depois da trava, outra execução pode entrar.
 */
export function fimDaTrava(ex: Execucao): number {
  return Math.min(ex.fim + FOLGA_DA_TRAVA_S * 1000, ex.morte);
}

/** O teto das novas tentativas de gravar um efeito que já aconteceu fora: o fim da trava, e nunca a menos de 2 s da morte. */
export function tetoDasGravacoes(ex: Execucao): number {
  return Math.min(fimDaTrava(ex), ex.morte - FOLGA_DA_GRAVACAO_MS);
}

/**
 * Uma chamada de fora com efeito (envio ao Meta, /oauth/token) só começa se o timeout inteiro, mais 2 s para
 * gravar o que ela fez, termina antes do fim da trava. Nunca encurtada: abortar uma chamada que o outro lado
 * concluiu reenviaria o evento ou perderia o refresh rotacionado.
 */
export function cabeAChamada(fimDaTrava: number, agora: number, timeoutMs: number): boolean {
  return agora + timeoutMs + FOLGA_DA_GRAVACAO_MS <= fimDaTrava;
}

/** null = a 6ª falha: o pedido sai da fila e fica como falha visível (uma alteração nova o reabre). */
export function proximaTentativa(tentativa: number, agora: number): Date | null {
  if (tentativa < 1 || tentativa > RECUOS_MS.length) return null;
  return new Date(agora + RECUOS_MS[tentativa - 1]);
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Uma função que é true só na primeira chamada (a releitura das situações, uma por execução). */
export function soNaPrimeiraVez(): () => boolean {
  let feita = false;
  return () => {
    const primeira = !feita;
    feita = true;
    return primeira;
  };
}

export function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Começo de toda linha de log do motor: a loja e, quando é de um pedido, o id dele no Bling. Nada de token ou dado da cliente. */
export function rotulo(tenantId: string, pedido?: number): string {
  return pedido === undefined ? `loja ${tenantId}` : `loja ${tenantId} pedido ${pedido}`;
}

/** Loja que precisa da dona: marca, avisa uma vez por e-mail e para. */
export async function reconectar(ex: Execucao, motivo: string): Promise<never> {
  await ex.deps.conexoes.marcarReconectar(ex.tenantId, motivo);
  await ex.deps.avisarReconectar(ex.tenantId);
  throw new ParadaDaRodada("reconectar");
}

/**
 * O que encerra a rodada sem ser falha da loja. O prazo da execução vem do cliente marcado no erro
 * (`prazoEsgotado`): é o orçamento acabando, e contar como falha queimaria uma tentativa do pedido
 * e um passo do disjuntor.
 */
export function comoParada(e: unknown): ParadaDaRodada | null {
  if (e instanceof ParadaDaRodada) return e;
  return e instanceof ErroBling && e.prazoEsgotado ? new ParadaDaRodada("orcamento") : null;
}

export async function registrarSucesso(r: Rodada): Promise<void> {
  r.ex.falhasSeguidas = 0;
  if (r.conexao.consecutiveFailures === 0) return;
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, { consecutive_failures: 0 });
  r.conexao = { ...r.conexao, consecutiveFailures: 0 };
}

/** Conta o erro (de um pedido, quando há) e decide pela loja: segue (o passo que falhou desiste) ou para a rodada. */
export async function tratarErro(r: Rodada, e: unknown, pedido?: number): Promise<void> {
  const parada = comoParada(e);
  if (parada) throw parada;
  r.ex.falhas += 1;
  r.ex.ultimoErro = mensagemDe(e);
  if (e instanceof ErroBling) await porTipo(r, e, pedido);
  else console.error(`[bling/sincronizar] ${rotulo(r.ex.tenantId, pedido)}: ${mensagemDe(e)}`);
  if (r.ex.falhas > MAX_FALHAS) throw new ParadaDaRodada("erros");
}

/**
 * Nenhum tipo marca reconectar: o 401 que sobra depois de renovar é incidente (`transitorio`), e só
 * a concessão recusada pelo /oauth/token derruba a loja (`sincronizar-token.ts`).
 */
async function porTipo(r: Rodada, e: ErroBling, pedido: number | undefined): Promise<void> {
  const { ex } = r;
  // A mensagem do cliente só tem o caminho e o HTTP: nem token nem dado da cliente.
  console.warn(`[bling/sincronizar] ${rotulo(ex.tenantId, pedido)}: ${e.tipo}: ${e.message}`);
  if (e.tipo === "escopo") {
    await ex.deps.conexoes.atualizarConexao(ex.tenantId, { last_error: SEM_ESCOPO, last_error_at: iso(agoraMs(ex)) });
    throw new ParadaDaRodada("escopo");
  }
  if (e.tipo === "limite" && e.periodo === "dia") return pausar(ex, PAUSA_DA_COTA_MS, null, e.message);
  if (e.tipo === "limite" || e.tipo === "transitorio") return contarFalhaSeguida(r, e.message);
}

async function contarFalhaSeguida(r: Rodada, mensagem: string): Promise<void> {
  r.ex.falhasSeguidas += 1;
  if (r.ex.falhasSeguidas < FALHAS_PARA_PAUSAR) return;
  // Disjuntor: 15 min, 30, 1 h, 2 h… cada queda seguida da loja dobra a pausa, até 2 h.
  const quedas = r.conexao.consecutiveFailures;
  return pausar(r.ex, Math.min(PAUSA_BASE_MS * 2 ** quedas, PAUSA_MAXIMA_MS), quedas + 1, mensagem);
}

/** A última mensagem vai junto: o cartão explica a pausa. */
async function pausar(ex: Execucao, ms: number, quedas: number | null, mensagem: string): Promise<never> {
  const agora = agoraMs(ex);
  await ex.deps.conexoes.atualizarConexao(ex.tenantId, {
    paused_until: iso(agora + ms),
    last_error: mensagem.slice(0, TAMANHO_DO_ERRO),
    last_error_at: iso(agora),
    ...(quedas === null ? {} : { consecutive_failures: quedas }),
  });
  throw new ParadaDaRodada("pausa");
}

/** Nova tentativa do pedido que falhou: 1 min, 5 min, 30 min, 2 h, 12 h; a 6ª desiste (fica como falha). */
export async function reagendar(r: Rodada, linha: LinhaPedidoBling, e: unknown): Promise<void> {
  const tentativa = linha.attempts + 1;
  const proxima = proximaTentativa(tentativa, agoraMs(r.ex));
  const erro = mensagemDe(e).slice(0, TAMANHO_DO_ERRO);
  // false = um aviso reabriu o pedido no meio: a pendência nova fica como está.
  await r.ex.deps.pedidos.agendarNovaTentativa(r.ex.tenantId, linha.blingOrderId, tentativa, proxima, erro, linha.updatedAt);
}
