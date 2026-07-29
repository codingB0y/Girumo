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

export async function listLeads(tenantId: string): Promise<Lead[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("entered_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

/** Total de leads distintos do tenant (para marcos de funil first_lead/leads_50). */
export async function countLeads(tenantId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return count ?? 0;
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
