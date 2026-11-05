import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Valor de campo da pessoa: o banco guarda texto (cortado em 200) ou o escalar que veio. */
export type ContactFieldValue = string | number | boolean;

export type IgContactRow = {
  id: string;
  tenant_id: string;
  ig_user_id: string;
  username: string | null;
  fields: Record<string, ContactFieldValue>;
  tags: string[];
  first_seen_at: string;
  last_seen_at: string;
  last_dm_at: string | null;
  source_flow_id: string | null;
  updated_at: string;
};

const COLS = "id, tenant_id, ig_user_id, username, fields, tags, first_seen_at, last_seen_at, last_dm_at, source_flow_id, updated_at";

export type ApplyContactInput = {
  igUserId: string;
  username: string | null;
  /** Campo com valor `null` é APAGADO da ficha. */
  set?: Record<string, ContactFieldValue | null>;
  add?: string[];
  remove?: string[];
  /** Hora da interação; só anda para frente na ficha. */
  seenAt: string;
  /** Mensagem dela no direct (abre a janela da Meta); comentário e toque em fluxo não. */
  dm: boolean;
  sourceFlowId?: string | null;
};

/**
 * Grava a ficha num comando só (`ig_contact_apply`): duas mensagens da mesma pessoa chegando juntas
 * não apagam a gravação uma da outra. Quem chama manda campo e etiqueta já normalizados; a função SQL
 * é a guarda final dos limites (nunca falha por limite, só ignora).
 */
export async function applyContact(tenantId: string, input: ApplyContactInput): Promise<IgContactRow> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_contact_apply", {
    p_tenant: tenantId,
    p_ig_user_id: input.igUserId,
    p_username: input.username,
    p_set: input.set ?? {},
    p_add: input.add ?? [],
    p_remove: input.remove ?? [],
    p_seen_at: input.seenAt,
    p_dm: input.dm,
    p_source_flow: input.sourceFlowId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as IgContactRow;
}

export async function getContactByIgUserId(tenantId: string, igUserId: string): Promise<IgContactRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_contacts").select(COLS).eq("tenant_id", tenantId).eq("ig_user_id", igUserId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as IgContactRow | null) ?? null;
}

export async function getContactById(tenantId: string, id: string): Promise<IgContactRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_contacts").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as IgContactRow | null) ?? null;
}

export type ContactStats = {
  total: number;
  hoje: number;
  /** Conversaram nas últimas 24 h: ainda podem receber direct. */
  janela24h: number;
  comEtiqueta: number;
  campos: Array<{ campo: string; pessoas: number }>;
  etiquetas: Array<{ etiqueta: string; pessoas: number }>;
};

type StatsBruto = Partial<{
  total: number;
  hoje: number;
  janela_24h: number;
  com_etiqueta: number;
  campos: Array<{ campo: string; pessoas: number }>;
  etiquetas: Array<{ etiqueta: string; pessoas: number }>;
}>;

/** Contagens feitas no banco: o PostgREST corta lista em 1000 sem avisar. */
export async function contactStats(tenantId: string): Promise<ContactStats> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_contact_stats", { p_tenant: tenantId });
  if (error) throw new Error(error.message);
  const s = (data ?? {}) as StatsBruto;
  return {
    total: s.total ?? 0,
    hoje: s.hoje ?? 0,
    janela24h: s.janela_24h ?? 0,
    comEtiqueta: s.com_etiqueta ?? 0,
    campos: s.campos ?? [],
    etiquetas: s.etiquetas ?? [],
  };
}

/** Os valores que existem na loja para um campo, com a contagem de cada (top 50). */
export async function fieldValues(tenantId: string, field: string): Promise<Array<{ valor: string; pessoas: number }>> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_contact_field_values", { p_tenant: tenantId, p_field: field });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ valor: string; pessoas: number }>;
}

/**
 * Apagar da lista: a ficha e os atendimentos (`ig_runs`, com os passos em cascata) dela. `false` = a
 * pessoa não existe nesta loja. A cópia na Zernio e o índice de conversas são do plano 2.
 */
export async function deleteContact(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("ig_contacts").delete().eq("tenant_id", tenantId).eq("id", id).select("ig_user_id");
  if (error) throw new Error(error.message);
  const apagada = ((data ?? []) as Array<{ ig_user_id: string }>)[0];
  if (!apagada) return false;
  const { error: erroRuns } = await getSupabaseAdmin().from("ig_runs").delete().eq("tenant_id", tenantId).eq("ig_user_id", apagada.ig_user_id);
  if (erroRuns) throw new Error(erroRuns.message);
  return true;
}

export type PurgeResult = { inativas: number; lojaCancelada: number };

/** Prazos (12 meses sem conversa; 30 dias depois de cancelar o add-on). Todas as lojas de uma vez. */
export async function purgeContacts(nowIso: string): Promise<PurgeResult> {
  const { data, error } = await getSupabaseAdmin().rpc("ig_purge_contacts", { p_now: nowIso });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { inativas?: number; loja_cancelada?: number };
  return { inativas: r.inativas ?? 0, lojaCancelada: r.loja_cancelada ?? 0 };
}
