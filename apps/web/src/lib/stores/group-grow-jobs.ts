import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Fila de auto-grow (ver 20260812000000_group_grow_jobs.sql). Agnóstica de
// executor: hoje quem consome é a engine Baileys, amanhã é outro — nada aqui
// nomeia quem puxa.

export type GrowJobStatus = "queued" | "running" | "created" | "failed";

export type GrowJobRow = {
  id: string;
  tenant_id: string;
  campaign_group_id: string;
  campaign_slug: string;
  seq: number;
  subject: string;
  description: string | null;
  media_id: string | null;
  announce: boolean;
  member_add_mode: "admin_add" | "all_member_add";
  status: GrowJobStatus;
  attempts: number;
  whatsapp_group_id: string | null;
  invite_url: string | null;
  error: string | null;
  created_at: string;
  running_since: string | null;
  last_ack_at: string | null;
  updated_at: string;
};

const TABLE = "group_grow_jobs";

/** Job preso em "running" sem ack há mais que isto → o executor caiu. */
export const STALE_RUNNING_MS = 15 * 60_000;

/** Campanhas com job em voo — não empilhar criação em cima de criação. */
export async function listInFlightCampaignIds(tenantId: string): Promise<Set<string>> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("campaign_group_id")
    .eq("tenant_id", tenantId)
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.campaign_group_id as string));
}

/**
 * Próximo número ({n}) da campanha. Continua de onde a fila parou; na primeira
 * vez parte do tamanho do pool, para não renumerar grupos que já existem.
 */
export async function nextSeq(tenantId: string, campaignGroupId: string, poolSize: number): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("seq")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Math.max(data?.seq ?? 0, poolSize) + 1;
}

export async function enqueueGrowJob(
  tenantId: string,
  input: {
    campaign_group_id: string;
    campaign_slug: string;
    seq: number;
    subject: string;
    description?: string;
    media_id?: string;
    announce: boolean;
    member_add_mode: "admin_add" | "all_member_add";
  },
): Promise<GrowJobRow> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({ ...input, tenant_id: tenantId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Devolve à fila (como falha) os jobs cujo executor sumiu no meio. Roda antes do
 * claim, no mesmo passo — igual ao requeue de `automation_runs`.
 */
export async function failStaleRunning(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "failed",
      error: "Criação interrompida (executor desconectou).",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("status", "running")
    .lt("last_ack_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Reivindica tudo que está enfileirado. UPDATE de uma instrução só: um claim
 * concorrente bloqueia, reavalia e já não encontra nada em 'queued' — sem
 * criação dupla e sem precisar de função no banco.
 */
export async function claimQueued(tenantId: string): Promise<GrowJobRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "running", running_since: now, last_ack_at: now, updated_at: now })
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getGrowJob(tenantId: string, id: string): Promise<GrowJobRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function ackGrowJob(
  tenantId: string,
  id: string,
  patch: {
    status: GrowJobStatus;
    whatsapp_group_id?: string;
    invite_url?: string;
    error?: string | null;
  },
): Promise<GrowJobRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ ...patch, last_ack_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
