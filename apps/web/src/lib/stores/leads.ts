import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Leads capturados na entrada em grupos.
 *
 * Substitui o ndjson de `lib/leads-store.ts`, que só funcionava porque a engine
 * Baileys e o app dividiam disco. O worker da F3 roda em outro container.
 */

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  tenant_id: string;
  /** NULL quando o participante veio como `@lid` sem telefone. Nunca inventado. */
  phone: string | null;
  name: string | null;
  source_group_id: string | null;
  source_group_name: string | null;
  source_campaign: string | null;
  status: LeadStatus;
  /** Primeira entrada, imutável. */
  entered_at: string;
  last_seen_at: string | null;
  /** Outros grupos em que o mesmo número entrou. */
  also_in: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "leads";

type RespostaDoHead = { count: number | null; error: { message: string } | null; status: number };

/**
 * A contagem de uma consulta HEAD. HEAD não tem corpo: o erro chega sem
 * mensagem, um 404 vazio volta como 204 sem contagem, e um `Content-Range`
 * com `*` no lugar do total vira NaN. Tudo isso é erro, nunca um número que
 * ninguém mediu.
 */
function contagemDoHead({ count, error, status }: RespostaDoHead): number {
  if (error) throw new Error(error.message || `HTTP ${status}`);
  if (count === null || !Number.isInteger(count)) throw new Error(`HTTP ${status} sem contagem`);
  return count;
}

/**
 * Leads do tenant, ou só os de um status (head+count, sem puxar as linhas).
 * Contar a lista de `listLeads` parava nas 1000 linhas que o PostgREST devolve
 * sem erro.
 */
export async function countLeads(tenantId: string, status?: LeadStatus): Promise<number> {
  let query = getSupabaseAdmin()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (status) query = query.eq("status", status);
  return contagemDoHead(await query);
}

/**
 * Entradas nos grupos desde `since` (head+count, sem puxar as linhas): a regra de
 * `campaign_activity`, grupo de origem no pool e `entered_at >= since`.
 */
export async function countEntriesSince(tenantId: string, groupIds: string[], since: string): Promise<number> {
  if (groupIds.length === 0) return 0;
  // ponytail: os JIDs vão na URL; passando de ~230 grupos ela cruza os 8 mil
  // caracteres em que o postgrest-js já avisa do limite do servidor. Aí, fatiar
  // em lotes e somar (cada lead tem um grupo de origem só).
  return contagemDoHead(
    await getSupabaseAdmin()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("source_group_id", groupIds)
      .gte("entered_at", since),
  );
}

/**
 * O teto de linhas do PostgREST (max-rows do projeto, hoje 1000): página cheia é
 * sinal de que pode haver mais. Se o teto baixar, a 1ª página já viria curta, o
 * laço pararia nela e a conta sairia baixa sem erro.
 */
const PAGINA = 1000;

/**
 * Entradas desde `since`, por grupo de origem. Não há como agrupar sem puxar as
 * linhas (o PostgREST daqui não agrega), então pagina: um dia cheio numa loja
 * grande passa das 1000 que ele devolve sem avisar.
 */
export async function countEntriesByGroupSince(
  tenantId: string,
  groupIds: string[],
  since: string,
): Promise<Map<string, number>> {
  const porGrupo = new Map<string, number>();
  if (groupIds.length === 0) return porGrupo;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .select("source_group_id")
      .eq("tenant_id", tenantId)
      .in("source_group_id", groupIds)
      .gte("entered_at", since)
      // Sem ordem, o Postgres não garante que uma página não repita a outra.
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as Pick<Lead, "source_group_id">[];
    for (const { source_group_id: grupo } of pagina) {
      if (grupo) porGrupo.set(grupo, (porGrupo.get(grupo) ?? 0) + 1);
    }
    if (pagina.length < PAGINA) return porGrupo;
  }
}

/**
 * As `limit` entradas mais recentes nos grupos, filtradas aqui e não no
 * navegador: campanha quieta numa loja grande não aparecia entre as 1000 leads
 * mais novas da loja. Sem telefone, que a lista não mostra.
 */
export async function listLatestEntries(
  tenantId: string,
  groupIds: string[],
  limit: number,
): Promise<Pick<Lead, "id" | "name" | "source_group_name" | "entered_at">[]> {
  if (groupIds.length === 0) return [];
  // ponytail: o índice que serve é (tenant_id, entered_at desc); campanha com
  // menos de `limit` entradas percorre o histórico da loja inteira. Se a rota
  // pesar, (tenant_id, source_group_id, entered_at desc) nos dois bancos.
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, name, source_group_name, entered_at")
    .eq("tenant_id", tenantId)
    .in("source_group_id", groupIds)
    .order("entered_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Lead, "id" | "name" | "source_group_name" | "entered_at">[];
}

/** Origem de um lead (pra atribuir a campanha ao pedido). null se não achar. */
export async function getLeadAttribution(
  tenantId: string,
  leadId: string,
): Promise<Pick<Lead, "source_campaign" | "source_group_id"> | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("source_campaign, source_group_id")
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Mais recentes primeiro. `limit` é pro ticker do letreiro, que só quer o último. */
export async function listLeads(tenantId: string, limit?: number): Promise<Lead[]> {
  let query = getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("entered_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export type AddLeadInput = {
  phone: string;
  name?: string;
  sourceGroup: string;
  sourceGroupId?: string;
  sourceCampaign?: string;
};

/**
 * Cria ou reencontra o lead pelo telefone.
 *
 * Passa pelo RPC `upsert_lead` em vez de fazer select-depois-insert: o dedupe
 * precisa ser atômico, senão duas entradas simultâneas do mesmo número viram
 * dois leads. `entered_at` fica imutável; reentrada atualiza `last_seen_at` e
 * acumula a origem nova em `also_in`.
 */
export async function addLead(tenantId: string, input: AddLeadInput): Promise<Lead> {
  const { data, error } = await getSupabaseAdmin().rpc("upsert_lead", {
    target_tenant_id: tenantId,
    target_phone: input.phone ?? "",
    target_name: input.name ?? null,
    target_source_group_id: input.sourceGroupId ?? null,
    target_source_group_name: input.sourceGroup ?? null,
    target_source_campaign: input.sourceCampaign ?? null,
  });
  if (error) throw new Error(error.message);
  return data as Lead;
}

export async function updateLeadStatus(
  tenantId: string,
  id: string,
  status: LeadStatus,
): Promise<Lead | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Lead) ?? null;
}

export async function removeLead(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
