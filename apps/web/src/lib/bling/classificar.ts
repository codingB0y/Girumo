import type { PedidoResumo, SituacaoBling, TipoPedido } from "./tipos";

export type { TipoPedido } from "./tipos";

/** Ids das situações padrão de pedido de venda. Não são oficiais: várias fontes convergem neles. */
export const SITUACAO = {
  EM_ABERTO: 6,
  ATENDIDO: 9,
  CANCELADO: 12,
  EM_ANDAMENTO: 15,
  VENDA_AGENCIADA: 18,
  EM_DIGITACAO: 21,
  VERIFICADO: 24,
} as const;

const padrao = (id: number, nome: string): SituacaoBling => Object.freeze({ id, nome, base: id });

/** Usadas quando as situações da conta não carregam. Congeladas: são o padrão de toda loja. */
export const SITUACOES_PADRAO: readonly SituacaoBling[] = Object.freeze([
  padrao(SITUACAO.EM_ABERTO, "Em aberto"),
  padrao(SITUACAO.ATENDIDO, "Atendido"),
  padrao(SITUACAO.CANCELADO, "Cancelado"),
  padrao(SITUACAO.EM_ANDAMENTO, "Em andamento"),
  padrao(SITUACAO.VENDA_AGENCIADA, "Venda agenciada"),
  padrao(SITUACAO.EM_DIGITACAO, "Em digitação"),
  padrao(SITUACAO.VERIFICADO, "Verificado"),
]);

/** Cancelado e Em digitação: nunca contam como venda. */
export const BASES_BLOQUEADAS: ReadonlySet<number> = new Set([SITUACAO.CANCELADO, SITUACAO.EM_DIGITACAO]);

/** Situação própria herda de uma padrão; desconhecida vale por ela mesma (a 21 é reconhecida mesmo sem a lista). */
export function baseDaSituacao(id: number, situacoes: readonly SituacaoBling[]): number {
  return situacoes.find((s) => s.id === id)?.base ?? id;
}

/** O padrão de venda: tudo que herda de Atendido, inclusive ele. Sem repetição, para passar em `idsDeVendaValidos`. */
export function idsDeVendaPadrao(situacoes: readonly SituacaoBling[]): number[] {
  const ids = situacoes.filter((s) => s.base === SITUACAO.ATENDIDO).map((s) => s.id);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** As situações da conta; sem elas carregadas, as padrão do Bling (spec §1). */
export function situacoesOuPadrao(situacoes: readonly SituacaoBling[]): readonly SituacaoBling[] {
  return situacoes.length > 0 ? situacoes : SITUACOES_PADRAO;
}

/**
 * O que conta como venda: a escolha da loja; vazia = ela nunca escolheu, e vale o padrão calculado
 * agora sobre as situações atuais (uma filha de Atendido criada depois entra sozinha).
 */
export function idsDeVendaEfetivos(escolhidos: readonly number[], situacoes: readonly SituacaoBling[]): number[] {
  return escolhidos.length > 0 ? [...escolhidos] : idsDeVendaPadrao(situacoesOuPadrao(situacoes));
}

export function idsDeVendaValidos(ids: readonly number[], situacoes: readonly SituacaoBling[]): boolean {
  if (ids.length === 0 || new Set(ids).size !== ids.length) return false;
  return ids.every((id) => {
    const situacao = situacoes.find((s) => s.id === id);
    return situacao !== undefined && !BASES_BLOQUEADAS.has(situacao.base);
  });
}

/**
 * Spec §1 "Tipo do pedido". Total ≤ 0 nunca chega a `orders` (o relatório do funil recusa).
 * Base bloqueada fica fora de venda mesmo se a lista da loja estiver errada: a compra enviada ao Meta não se desfaz.
 */
export function classificarPedido(
  p: Pick<PedidoResumo, "situacaoId" | "total"> | null,
  situacoes: readonly SituacaoBling[],
  idsDeVenda: readonly number[],
): TipoPedido {
  if (p === null) return "excluido";
  const base = baseDaSituacao(p.situacaoId, situacoes);
  if (base === SITUACAO.EM_DIGITACAO) return "ignorado";
  if (!Number.isFinite(p.total) || p.total <= 0) return "ignorado";
  if (idsDeVenda.includes(p.situacaoId) && !BASES_BLOQUEADAS.has(base)) return "venda";
  return "pedido";
}

// São Paulo não tem horário de verão desde 2019: UTC−3 fixo, o mesmo do "-03:00" abaixo.
const FUSO_SAO_PAULO_MS = 3 * 60 * 60 * 1000;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Antes disso é data torta ("0001-01-01", a época Unix), não dia de pedido: vale como sem data. */
const PRIMEIRO_DIA = "2000-01-01";

function diaEmSaoPaulo(instante: Date): string {
  return new Date(instante.getTime() - FUSO_SAO_PAULO_MS).toISOString().slice(0, 10);
}

/** 12:00 de São Paulo do dia, ou null se não for uma data real (o Date do JS aceita 30/02 e vira março). */
function meioDiaEmSaoPaulo(dia: string): Date | null {
  if (!DIA.test(dia) || dia < PRIMEIRO_DIA) return null;
  const meioDia = new Date(`${dia}T12:00:00-03:00`);
  if (Number.isNaN(meioDia.getTime())) return null;
  return diaEmSaoPaulo(meioDia) === dia ? meioDia : null;
}

/**
 * A venda fica datada pelo dia do pedido, como no Bling: pedido antigo editado hoje não vira venda de hoje.
 * A referência é `vistoEm`, quando a Girumo viu o pedido pela primeira vez (`first_seen_at`): a nova
 * tentativa não muda a hora, e a venda, o `created_at` e o `event_time` batem. Dia de `vistoEm` em São
 * Paulo (ou data nula/inválida/antes de 2000) → `vistoEm`; outro dia → 12:00 de São Paulo dele; nunca
 * depois de `agora` (a data editada para hoje, de manhã, ainda não chegou ao meio-dia).
 */
export function horaDoPedido(dataPedido: string | null, vistoEm: Date, agora: Date): Date {
  const visto = Number.isNaN(vistoEm.getTime()) ? agora : vistoEm;
  const meioDia = dataPedido === null || dataPedido === diaEmSaoPaulo(visto) ? null : meioDiaEmSaoPaulo(dataPedido);
  return new Date(Math.min((meioDia ?? visto).getTime(), agora.getTime()));
}

/** O Meta recusa evento com mais de 7 dias (e derruba o lote): 1 h de folga para a fila e o envio. */
export const JANELA_META_MS = (7 * 24 - 1) * 60 * 60 * 1000;
// Relógio do servidor e do Meta não batem ao milissegundo.
const FOLGA_FUTURO_MS = 5 * 60 * 1000;

export function dentroDaJanelaMeta(hora: Date, agora: Date): boolean {
  const atraso = agora.getTime() - hora.getTime();
  return atraso <= JANELA_META_MS && atraso >= -FOLGA_FUTURO_MS;
}
