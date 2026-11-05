import "server-only";

import type { StatusConversa } from "@/lib/ig/conversas/situacao";
import { tombstoneHash } from "@/lib/ig/conversas/situacao";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Índice da lista de Conversas do Instagram (spec §7.2). Sem histórico: as mensagens ficam na Zernio. */

export type IgConversationRow = {
  id: string;
  tenant_id: string;
  ig_account_id: string | null;
  zernio_conversation_id: string;
  ig_user_id: string;
  username: string | null;
  display_name: string | null;
  status: StatusConversa;
  folder: "inbox" | "requests";
  unread_count: number;
  last_message_at: string | null;
  last_direction: "in" | "out" | null;
  last_preview: string | null;
  bot_paused_until: string | null;
  updated_at: string;
};

const COLS =
  "id, tenant_id, ig_account_id, zernio_conversation_id, ig_user_id, username, display_name, status, folder, unread_count, last_message_at, last_direction, last_preview, bot_paused_until, updated_at";

export const PAGE_SIZE = 50;

/** Mantém o `code` do PostgREST: quem chama separa falha passageira de erro que se repete. */
function erroDoBanco(error: { message: string; code?: string }): Error {
  return Object.assign(new Error(error.message), { code: error.code });
}

export type TouchInput = {
  zernioConversationId: string;
  igUserId: string;
  igAccountId?: string | null;
  username?: string | null;
  displayName?: string | null;
  direction: "in" | "out";
  /** Hora da mensagem; a última mensagem só anda para frente. */
  at: string;
  /** Texto da última mensagem (o banco corta em 200). */
  preview: string | null;
  /** Situação já decidida pelo servidor; `null` mantém a atual. */
  status: StatusConversa | null;
  /** Id da mensagem recebida: a mesma entrega repetida não soma não lida de novo (só em `in`). */
  messageId?: string | null;
};

/** Upsert atômico do índice (`ig_conversation_touch`): soma 1 não lida quando a direção é `in`. */
export async function touchConversation(tenantId: string, input: TouchInput): Promise<IgConversationRow> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_conversation_touch", {
    p_tenant: tenantId,
    p_zernio_conversation_id: input.zernioConversationId,
    p_ig_user_id: input.igUserId,
    p_ig_account_id: input.igAccountId ?? null,
    p_username: input.username ?? null,
    p_display_name: input.displayName ?? null,
    p_direction: input.direction,
    p_at: input.at,
    p_preview: input.preview,
    p_status: input.status,
    p_message_id: input.messageId ?? null,
  });
  if (error) throw erroDoBanco(error);
  return data as unknown as IgConversationRow;
}

async function getOne(tenantId: string, coluna: string, valor: string): Promise<IgConversationRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_conversations").select(COLS).eq("tenant_id", tenantId).eq(coluna, valor).maybeSingle();
  if (error) throw erroDoBanco(error);
  return (data as unknown as IgConversationRow | null) ?? null;
}

export const getConversationById = (tenantId: string, id: string) => getOne(tenantId, "id", id);
export const getConversationByZernioId = (tenantId: string, zernioId: string) => getOne(tenantId, "zernio_conversation_id", zernioId);

/** Uma pessoa pode ter mais de uma conversa (conta trocada): vale a mais recente. */
export async function getConversationByIgUserId(tenantId: string, igUserId: string): Promise<IgConversationRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_conversations")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("ig_user_id", igUserId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw erroDoBanco(error);
  return ((data as unknown as IgConversationRow[] | null) ?? [])[0] ?? null;
}

export type ListFilters = {
  status?: StatusConversa;
  /** Só as com mensagem não lida. */
  unread?: boolean;
  /** Trecho do @ ou do nome. */
  busca?: string;
  /** Opaco: vem de `nextCursor` da página anterior. */
  cursor?: string;
  /** Só estas pessoas (filtro por etiqueta, que mora nas fichas). Lista vazia = ninguém, sem ir ao banco. */
  igUserIds?: string[];
};

export type ConversationPage = { items: IgConversationRow[]; nextCursor: string | null };

/** Busca vai dentro de um filtro `or` do PostgREST: tira o que quebraria a sintaxe (vírgula, parêntese) e os curingas do `ilike`. */
function termoSeguro(busca: string): string {
  return busca.replace(/[^\p{L}\p{N}. -]/gu, "").trim().slice(0, 60);
}

/** Posição da próxima página; cursor inválido volta para o começo. */
function posicao(cursor: string | undefined): number {
  const n = cursor && /^\d{1,6}$/.test(cursor) ? Number(cursor) : 0;
  return Number.isSafeInteger(n) ? n : 0;
}

/**
 * Lista por `last_message_at desc` (sem data por último) e `id`, 50 por página, paginando por posição: nenhuma
 * linha some em empate de horário ou sem data. Conversa que sobe entre uma página e outra pode repetir: a tela
 * descarta pelo `id`.
 */
export async function listConversations(tenantId: string, filters: ListFilters = {}): Promise<ConversationPage> {
  if (filters.igUserIds && filters.igUserIds.length === 0) return { items: [], nextCursor: null };
  let q = getSupabaseAdmin().from("ig_conversations").select(COLS).eq("tenant_id", tenantId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.unread) q = q.gt("unread_count", 0);
  if (filters.igUserIds) q = q.in("ig_user_id", filters.igUserIds);
  const termo = filters.busca ? termoSeguro(filters.busca) : "";
  if (termo) q = q.or(`username.ilike.%${termo}%,display_name.ilike.%${termo}%`);
  const de = posicao(filters.cursor);
  const { data, error } = await q
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(de, de + PAGE_SIZE);
  if (error) throw erroDoBanco(error);
  const linhas = (data as unknown as IgConversationRow[] | null) ?? [];
  return { items: linhas.slice(0, PAGE_SIZE), nextCursor: linhas.length > PAGE_SIZE ? String(de + PAGE_SIZE) : null };
}

/** Quantas conversas há na situação (count `head`, sem trazer linhas): o contador "aguardando você". */
export async function countConversations(tenantId: string, status: StatusConversa): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("ig_conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", status);
  if (error) throw erroDoBanco(error);
  return count ?? 0;
}

/**
 * Ids do Instagram de quem tem a etiqueta na loja (a etiqueta mora na ficha, não no índice), os mais recentes
 * primeiro. `limite` existe porque os ids entram na URL do filtro `in`; quem chama pede um a mais para saber se cortou.
 */
export async function listIgUserIdsByTag(tenantId: string, tag: string, limite: number): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin().from("ig_contacts").select("ig_user_id").eq("tenant_id", tenantId).contains("tags", [tag]).order("last_seen_at", { ascending: false }).limit(limite);
  if (error) throw erroDoBanco(error);
  return ((data as unknown as Array<{ ig_user_id: string }> | null) ?? []).map((r) => r.ig_user_id);
}

/**
 * Acerto da importação (varredura): situação de importada e não lidas zeradas, SÓ se não chegou mensagem mais nova
 * que a importada. Sem isso, o webhook que criou a conversa no meio da varredura seria rebaixado e perderia a não lida.
 */
export async function settleImportedConversation(tenantId: string, id: string, atIso: string, status: StatusConversa): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_conversations").update({ status, unread_count: 0 }).eq("tenant_id", tenantId).eq("id", id).lte("last_message_at", atIso);
  if (error) throw erroDoBanco(error);
}

/** Os ids da Zernio e a conta de cada conversa da pessoa, para pedir a exclusão ANTES de apagar o índice. */
export async function listConversationsOf(tenantId: string, igUserId: string): Promise<Array<{ zernioConversationId: string; igAccountId: string | null }>> {
  const { data, error } = await getSupabaseAdmin().from("ig_conversations").select("zernio_conversation_id, ig_account_id").eq("tenant_id", tenantId).eq("ig_user_id", igUserId);
  if (error) throw erroDoBanco(error);
  return ((data as unknown as Array<{ zernio_conversation_id: string; ig_account_id: string | null }> | null) ?? []).map((r) => ({ zernioConversationId: r.zernio_conversation_id, igAccountId: r.ig_account_id }));
}

export type ConversationPatch = Partial<{ status: StatusConversa; bot_paused_until: string | null; unread_count: number }>;

/** `null` = a conversa não existe nesta loja. */
export async function updateConversation(tenantId: string, id: string, patch: ConversationPatch): Promise<IgConversationRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_conversations").update(patch).eq("tenant_id", tenantId).eq("id", id).select(COLS);
  if (error) throw erroDoBanco(error);
  return ((data as unknown as IgConversationRow[] | null) ?? [])[0] ?? null;
}

export type ConversationEventKind = "bot_message" | "store_message" | "waiting" | "paused" | "resolved";

export type ConversationEventRow = {
  id: number;
  conversation_id: string;
  kind: ConversationEventKind;
  zernio_message_id: string | null;
  run_id: string | null;
  detail: string | null;
  occurred_at: string;
};

export type ConversationEventInput = {
  conversationId: string;
  kind: ConversationEventKind;
  /** Só nas mensagens que nós mandamos. */
  zernioMessageId?: string | null;
  runId?: string | null;
  /** Motivo curto, nunca texto de mensagem. */
  detail?: string | null;
  occurredAt?: string;
};

/** Registro SEM texto do que o robô e a loja fizeram. */
export async function recordConversationEvent(tenantId: string, e: ConversationEventInput): Promise<void> {
  // Reentrega do mesmo envio: o par (conversa, id da mensagem) é único; o duplicado é ignorado.
  const { error } = await getSupabaseAdmin()
    .from("ig_conversation_events")
    .upsert(
      {
        tenant_id: tenantId,
        conversation_id: e.conversationId,
        kind: e.kind,
        zernio_message_id: e.zernioMessageId ?? null,
        run_id: e.runId ?? null,
        detail: e.detail ?? null,
        ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
      },
      { onConflict: "conversation_id,zernio_message_id", ignoreDuplicates: true },
    );
  if (error) throw erroDoBanco(error);
}

export async function listConversationEvents(tenantId: string, conversationId: string): Promise<ConversationEventRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_conversation_events")
    .select("id, conversation_id, kind, zernio_message_id, run_id, detail, occurred_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: true })
    .limit(1000);
  if (error) throw erroDoBanco(error);
  return (data as unknown as ConversationEventRow[] | null) ?? [];
}

/**
 * Apagar da lista: tira o índice da pessoa (o registro vai em cascata). Devolve o que foi apagado para
 * quem chama pedir à Zernio que apague a cópia da conversa.
 */
export async function deleteConversationsOf(tenantId: string, igUserId: string): Promise<Array<{ zernioConversationId: string; igAccountId: string | null }>> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_conversations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("ig_user_id", igUserId)
    .select("zernio_conversation_id, ig_account_id");
  if (error) throw erroDoBanco(error);
  return ((data as unknown as Array<{ zernio_conversation_id: string; ig_account_id: string | null }> | null) ?? []).map((r) => ({
    zernioConversationId: r.zernio_conversation_id,
    igAccountId: r.ig_account_id,
  }));
}

/** Marca quem a loja apagou (hash, nunca o id) para a varredura do Atualizar não trazer de volta. */
export async function addTombstone(tenantId: string, igUserId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("ig_contact_tombstones")
    .upsert({ tenant_id: tenantId, ig_user_hash: tombstoneHash(tenantId, igUserId), deleted_at: new Date().toISOString() }, { onConflict: "tenant_id,ig_user_hash" });
  if (error) throw erroDoBanco(error);
}

export async function hasTombstone(tenantId: string, igUserId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_contact_tombstones")
    .select("ig_user_hash")
    .eq("tenant_id", tenantId)
    .eq("ig_user_hash", tombstoneHash(tenantId, igUserId))
    .maybeSingle();
  if (error) throw erroDoBanco(error);
  return data !== null;
}

export type ConversationRoutineResult = {
  resolvidasParada24h: number;
  resolvidasJanelaFechou: number;
  apagadas12Meses: number;
  apagadasLojaCancelada: number;
  marcadoresApagados: number;
};

/** Rotina de hora em hora: fecha conversas e apaga o que passou do prazo, em todas as lojas. */
export async function runConversationRoutine(nowIso: string): Promise<ConversationRoutineResult> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_conversations_rotina", { p_now: nowIso });
  if (error) throw erroDoBanco(error);
  const r = (data ?? {}) as Partial<Record<string, number>>;
  return {
    resolvidasParada24h: r.resolvidas_parada_24h ?? 0,
    resolvidasJanelaFechou: r.resolvidas_janela_fechou ?? 0,
    apagadas12Meses: r.apagadas_12_meses ?? 0,
    apagadasLojaCancelada: r.apagadas_loja_cancelada ?? 0,
    marcadoresApagados: r.marcadores_apagados ?? 0,
  };
}
