import "server-only";

import { z } from "zod";

import type { PedidoResumo, TipoPedido } from "@/lib/bling/tipos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `bling_orders`: espelho dos pedidos do Bling e fila do motor ao mesmo tempo
 * (spec 2026-10-13-integracao-bling §2/§3). Service-role ignora o RLS: o
 * `.eq("tenant_id")` de cada query é a proteção real.
 */

const TABLE = "bling_orders";
const COLS =
  "tenant_id, bling_order_id, numero, order_date, total, situacao_id, bling_contact_id, kind, order_id, origin, first_seen_at, sale_at, ic_status, purchase_status, meta_error, origem, origem_detalhe, snapshot, pending, attempts, next_try_at, last_error, updated_at";

export type StatusEvento = "enviado" | "fora_da_janela" | "sem_pixel" | "desligado" | "sem_dados" | "erro";

export type LinhaPedidoBling = {
  tenantId: string;
  blingOrderId: number;
  numero: string | null;
  orderDate: string | null;
  total: number | null;
  situacaoId: number | null;
  blingContactId: number | null;
  kind: TipoPedido | null;
  orderId: string | null;
  origin: "aviso" | "varredura" | "historico";
  firstSeenAt: string;
  saleAt: string | null;
  icStatus: StatusEvento | null;
  purchaseStatus: StatusEvento | null;
  metaError: string | null;
  origem: "anuncio" | "grupo" | "sem_origem" | null;
  origemDetalhe: string | null;
  /** Último retrato da lista do Bling; null = o processamento faz GET do pedido. */
  snapshot: PedidoResumo | null;
  pending: boolean;
  attempts: number;
  nextTryAt: string;
  lastError: string | null;
  /**
   * Token da leitura, no texto exato do PostgREST (microssegundos): aviso e varredura o
   * trocam ao reabrir o pedido. Volta tal qual nas gravações que conferem se a linha mudou.
   */
  updatedAt: string;
};

/** O estado que o processamento usou e decidiu. Horários em `Date`; a store grava ISO. */
export type ResultadoProcessamento = {
  numero: string | null;
  orderDate: string | null;
  total: number | null;
  situacaoId: number | null;
  blingContactId: number | null;
  kind: TipoPedido;
  orderId: string | null;
  saleAt: Date | null;
  icStatus: StatusEvento | null;
  icSentAt: Date | null;
  purchaseStatus: StatusEvento | null;
  purchaseSentAt: Date | null;
  metaError: string | null;
  origem: "anuncio" | "grupo" | "sem_origem" | null;
  origemDetalhe: string | null;
  /** O estado usado: a varredura compara o próximo retrato com ele. null = excluído. */
  snapshot: PedidoResumo | null;
};

/** O que já aconteceu fora da fila (pedido em `orders`, eventos no Meta) e não pode se repetir. */
export type EfeitosDoPedido = Pick<
  ResultadoProcessamento,
  "orderId" | "saleAt" | "icStatus" | "icSentAt" | "purchaseStatus" | "purchaseSentAt" | "metaError" | "origem" | "origemDetalhe"
>;

export type AgendaDoPedido = { pendente: false } | { pendente: true; tentativas: number; proxima: Date; erro: string };

/** bigint e numeric podem chegar do PostgREST em texto. */
type Numerico = number | string;

type Row = {
  tenant_id: string;
  bling_order_id: Numerico;
  numero: string | null;
  order_date: string | null;
  total: Numerico | null;
  situacao_id: Numerico | null;
  bling_contact_id: Numerico | null;
  kind: TipoPedido | null;
  order_id: string | null;
  origin: LinhaPedidoBling["origin"];
  first_seen_at: string;
  sale_at: string | null;
  ic_status: StatusEvento | null;
  purchase_status: StatusEvento | null;
  meta_error: string | null;
  origem: LinhaPedidoBling["origem"];
  origem_detalhe: string | null;
  snapshot: unknown;
  pending: boolean;
  attempts: number;
  next_try_at: string;
  last_error: string | null;
  updated_at: string;
};

// O retrato é jsonb escrito pela fila e pelo processamento; torto, o pedido paga um GET em vez de ser lido errado.
// Sem `lojaId` vale (retrato de antes do canal): "não se sabe", e o processamento decide se relê.
const resumoGuardado = z.object({
  id: z.number(),
  numero: z.string().nullable(),
  data: z.string().nullable(),
  total: z.number(),
  contatoId: z.number().nullable(),
  situacaoId: z.number(),
  lojaId: z.number().nullable().optional(),
});

const numeroOuNulo = (v: Numerico | null): number | null => (v === null ? null : Number(v));
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

function snapshotDe(v: unknown): PedidoResumo | null {
  const lido = resumoGuardado.safeParse(v);
  return lido.success ? lido.data : null;
}

function toLinha(r: Row): LinhaPedidoBling {
  return {
    tenantId: r.tenant_id,
    blingOrderId: Number(r.bling_order_id),
    numero: r.numero,
    orderDate: r.order_date,
    total: numeroOuNulo(r.total),
    situacaoId: numeroOuNulo(r.situacao_id),
    blingContactId: numeroOuNulo(r.bling_contact_id),
    kind: r.kind,
    orderId: r.order_id,
    origin: r.origin,
    firstSeenAt: r.first_seen_at,
    saleAt: r.sale_at,
    icStatus: r.ic_status,
    purchaseStatus: r.purchase_status,
    metaError: r.meta_error,
    origem: r.origem,
    origemDetalhe: r.origem_detalhe,
    snapshot: snapshotDe(r.snapshot),
    pending: r.pending,
    attempts: r.attempts,
    nextTryAt: r.next_try_at,
    lastError: r.last_error,
    updatedAt: r.updated_at,
  };
}

/**
 * Fila num comando só (`bling_enqueue`, spec §2): o aviso só manda o id; varredura e
 * histórico mandam o `PedidoResumo` inteiro, que vira o retrato. Devolve quantas linhas mudaram.
 */
export function enfileirarPedidos(tenantId: string, origem: "aviso", itens: readonly { id: number }[]): Promise<number>;
export function enfileirarPedidos(
  tenantId: string,
  origem: "varredura" | "historico",
  itens: readonly PedidoResumo[],
): Promise<number>;
export async function enfileirarPedidos(
  tenantId: string,
  origem: LinhaPedidoBling["origin"],
  itens: readonly { id: number }[],
): Promise<number> {
  if (itens.length === 0) return 0;
  // Mesma regra do SQL (vale o último lido de cada id); aqui só encurta o lote.
  const unicos = [...new Map(itens.map((item) => [item.id, item])).values()];
  const { data, error } = await getSupabaseAdmin().rpc("bling_enqueue", {
    p_tenant: tenantId,
    p_origin: origem,
    p_items: unicos,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

/**
 * Pendentes com a próxima tentativa vencida: o que só o histórico marcou (`low_priority`) vai depois,
 * e os mais antigos primeiro. A venda que o aviso acabou de marcar não espera atrás de 90 dias.
 */
export async function listarPendentes(tenantId: string, agora: Date, limite: number): Promise<LinhaPedidoBling[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("pending", true)
    .lte("next_try_at", agora.toISOString())
    .order("low_priority", { ascending: true })
    .order("next_try_at", { ascending: true })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toLinha);
}

export async function existePendenteVencido(tenantId: string, agora: Date): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("bling_order_id")
    .eq("tenant_id", tenantId)
    .eq("pending", true)
    .lte("next_try_at", agora.toISOString())
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Contagem no banco: ler as linhas pararia em 1000 sem erro. */
export async function contarPendentes(tenantId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("bling_order_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("pending", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function camposDaAgenda(agenda: AgendaDoPedido) {
  return agenda.pendente
    ? { pending: true, attempts: agenda.tentativas, next_try_at: agenda.proxima.toISOString(), last_error: agenda.erro }
    : { pending: false, attempts: 0, last_error: null };
}

/** Data de envio só sai preenchida no envio de agora: sem ela a coluna fica de fora (null apagaria a do envio anterior). */
function colunasDosEfeitos(e: EfeitosDoPedido) {
  return {
    order_id: e.orderId,
    sale_at: iso(e.saleAt),
    ic_status: e.icStatus,
    ...(e.icSentAt ? { ic_sent_at: iso(e.icSentAt) } : {}),
    purchase_status: e.purchaseStatus,
    ...(e.purchaseSentAt ? { purchase_sent_at: iso(e.purchaseSentAt) } : {}),
    meta_error: e.metaError,
    origem: e.origem,
    origem_detalhe: e.origemDetalhe,
  };
}

/**
 * UPDATE só se a linha não mudou desde a leitura (`updated_at` igual ao lido). Um aviso
 * no meio do processamento reabre o pedido e troca o token: gravar por cima marcaria
 * como feito um pedido que mudou — e um `order.deleted` assim se perderia de vez, porque
 * a varredura não lista pedido apagado. false = chegou novidade; a linha fica pendente.
 */
async function atualizarSeIntacta(
  tenantId: string,
  id: number,
  updatedAtLido: string,
  campos: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(campos)
    .eq("tenant_id", tenantId)
    .eq("bling_order_id", id)
    .eq("updated_at", updatedAtLido)
    .select("bling_order_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/** Grava o estado processado e a agenda num UPDATE só (o retrato junto, com a hora). false = a linha mudou. */
export async function salvarProcessado(
  tenantId: string,
  id: number,
  r: ResultadoProcessamento,
  agenda: AgendaDoPedido,
  updatedAtLido: string,
): Promise<boolean> {
  const agora = new Date().toISOString();
  return atualizarSeIntacta(tenantId, id, updatedAtLido, {
    numero: r.numero,
    order_date: r.orderDate,
    total: r.total,
    situacao_id: r.situacaoId,
    bling_contact_id: r.blingContactId,
    kind: r.kind,
    ...colunasDosEfeitos(r),
    snapshot: r.snapshot,
    snapshot_at: r.snapshot ? agora : null,
    ...camposDaAgenda(agenda),
    updated_at: agora,
  });
}

/**
 * Sem conferir a linha e sem tocar no `updated_at`, de propósito: registra o que já
 * aconteceu fora daqui mesmo quando um aviso chegou no meio. O pedido segue pendente com
 * o token do aviso, e a volta seguinte não cria outro pedido nem reenvia evento.
 */
export async function salvarEfeitos(tenantId: string, id: number, e: EfeitosDoPedido): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(colunasDosEfeitos(e))
    .eq("tenant_id", tenantId)
    .eq("bling_order_id", id);
  if (error) throw new Error(error.message);
}

/**
 * Erro do pedido. `proxima` null = desistiu: sai da fila e fica como falha (uma alteração
 * nova reabre). false = a linha mudou (aviso no meio): fica a pendência nova, intacta.
 */
export async function agendarNovaTentativa(
  tenantId: string,
  id: number,
  tentativas: number,
  proxima: Date | null,
  erro: string,
  updatedAtLido: string,
): Promise<boolean> {
  const campos = proxima
    ? camposDaAgenda({ pendente: true, tentativas, proxima, erro })
    : { pending: false, attempts: tentativas, last_error: erro };
  return atualizarSeIntacta(tenantId, id, updatedAtLido, { ...campos, updated_at: new Date().toISOString() });
}

/**
 * Ajuste mudou: pedidos desde `dia` (e, na fila, os sem dia: nunca processados) voltam à fila na hora, com `updated_at`
 * novo (o processamento em andamento não grava por cima). O que volta vai atrás da venda ao vivo (`low_priority`; aviso
 * e varredura que tocam a linha a trazem para a frente): reprocessar 90 dias não atrasa a venda que o aviso acabou de
 * marcar, e a que já estava na fila mantém a prioridade. Conta pelo cabeçalho do PostgREST (as linhas param em 1000).
 */
export async function reabrirDesde(tenantId: string, dia: string): Promise<number> {
  const agora = new Date().toISOString();
  const reaberta = { attempts: 0, next_try_at: agora, updated_at: agora };
  // Primeiro as que já estão na fila: na ordem inversa, as que acabaram de voltar seriam pegas de novo.
  const naFila = await reabrirLinhas(tenantId, dia, true, reaberta);
  return naFila + (await reabrirLinhas(tenantId, dia, false, { ...reaberta, pending: true, low_priority: true }));
}

async function reabrirLinhas(tenantId: string, dia: string, pendente: boolean, campos: Record<string, unknown>): Promise<number> {
  const linhas = getSupabaseAdmin()
    .from(TABLE)
    .update(campos, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("pending", pendente);
  const { error, count } = await (pendente ? linhas.or(`order_date.gte.${dia},order_date.is.null`) : linhas.gte("order_date", dia));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const contagem = z.number().int().nonnegative();
// O jsonb do `bling_resumo` como o SQL monta. Chave nova passa (some no parse); faltar ou vir torta, não.
const numerosDoCartao = z.object({
  vendas_30d: contagem,
  vendido_30d: z.number(),
  origem_30d: z.object({ anuncio: contagem, grupo: contagem, sem_origem: contagem }),
  meta_30d: z.object({
    enviado: contagem,
    fora_da_janela: contagem,
    sem_pixel: contagem,
    sem_dados: contagem,
    desligado: contagem,
    erro: contagem,
  }),
  pendentes: contagem,
  falhas: contagem,
  historico_lidos: contagem,
  listas: z.object({ alto_valor: contagem, comprador: contagem, lead: contagem }),
});

/** Números do cartão em snake_case, como o SQL devolve. */
export type ResumoBling = z.infer<typeof numerosDoCartao>;

/** Somas e contagens feitas no banco (`bling_resumo`): ler as linhas pararia em 1000 sem erro. */
export async function lerResumo(tenantId: string): Promise<ResumoBling> {
  const { data, error } = await getSupabaseAdmin().rpc("bling_resumo", { p_tenant: tenantId });
  if (error) throw new Error(error.message);
  const lido = numerosDoCartao.safeParse(data);
  // Formato errado é defeito do SQL: estoura em vez de mostrar zero vendas no cartão.
  if (!lido.success) throw new Error("bling_resumo: formato inesperado");
  return lido.data;
}

/**
 * As últimas vendas e pedidos do cartão: dia do pedido mais novo primeiro (sem dia por
 * último), e no mesmo dia o id mais alto (o Bling numera em ordem de criação).
 * ponytail: o índice `bling_orders_recent_idx` é `order_date desc` (nulls first), então o
 * "nulls last" ordena as linhas da loja num sort top-N; criar o índice com `nulls last` se
 * o cartão de uma loja grande ficar lento.
 */
export async function ultimasDoCartao(tenantId: string, limite: number): Promise<LinhaPedidoBling[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLS)
    .eq("tenant_id", tenantId)
    .in("kind", ["venda", "pedido"])
    .order("order_date", { ascending: false, nullsFirst: false })
    .order("bling_order_id", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toLinha);
}

/** Um pedido com canal de venda, para a lista de canais do cartão. */
export type PedidoComCanal = { lojaId: number; numero: string | null; orderDate: string | null };

const comCanal = z.object({
  numero: z.string().nullable(),
  data: z.string().nullable(),
  // O `->` devolve o jsonb: número. Booleano passa no filtro (true > 0 no jsonb) e cai aqui.
  loja: z.number().int().positive(),
});

/**
 * Os pedidos mais novos com canal (`snapshot->lojaId` > 0: o `->` compara jsonb, então null, 0 e o retrato antigo, sem
 * a chave, ficam de fora). Tudo do retrato, que a fila já grava (as colunas só depois de processar). Mais novo = id
 * maior (o Bling numera em ordem de criação), pela chave primária. Até `limite`: os canais da loja nos pedidos recentes.
 */
export async function pedidosComCanal(tenantId: string, limite: number): Promise<PedidoComCanal[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("numero:snapshot->>numero,data:snapshot->>data,loja:snapshot->lojaId")
    .eq("tenant_id", tenantId)
    .gt("snapshot->lojaId", 0)
    .order("bling_order_id", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).flatMap((linha) => {
    const lida = comCanal.safeParse(linha);
    return lida.success ? [{ lojaId: lida.data.loja, numero: lida.data.numero, orderDate: lida.data.data }] : [];
  });
}
