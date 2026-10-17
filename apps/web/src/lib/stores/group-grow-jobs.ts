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
 *
 * Job `failed` sem `whatsapp_group_id` não gasta número: nada nasceu no
 * WhatsApp (sem instância, createGroup recusado, adiado pelo ritmo). Contá-lo
 * queimava um número por tentativa — 2447 em prod, e o 1º grupo nasceria
 * "… 2448". O número volta a ser usado por `enqueueGrowJob`.
 */
export async function nextSeq(tenantId: string, campaignGroupId: string, poolSize: number): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("seq")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .or("status.neq.failed,whatsapp_group_id.not.is.null")
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
  // O número pode ser o de um job que falhou sem criar grupo (ver `nextSeq`), e o
  // índice único (tenant, campanha, seq) recusaria outro INSERT: reaproveita a
  // linha. Só `failed` sem JID — um job em voo ou com grupo no WhatsApp nunca
  // volta para a fila (seria grupo duplicado). Sem linha assim, INSERT normal, e
  // um enfileiramento concorrente continua estourando no índice.
  const now = new Date().toISOString();
  const reuse = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      ...input,
      description: input.description ?? null,
      media_id: input.media_id ?? null,
      status: "queued",
      error: null,
      invite_url: null,
      running_since: null,
      last_ack_at: null,
      created_at: now,
      updated_at: now,
    })
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", input.campaign_group_id)
    .eq("seq", input.seq)
    .eq("status", "failed")
    .is("whatsapp_group_id", null)
    .select("*")
    .maybeSingle();
  if (reuse.error) throw new Error(reuse.error.message);
  if (reuse.data) return reuse.data;

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

export type GrupoCriado = { seq: number; subject: string; whatsapp_group_id: string | null; updated_at: string };

/**
 * Grupos que o "Grupo lotou → abre outro" criou para a campanha desde `desde`,
 * do mais antigo ao mais novo. `updated_at` é a hora do ack `created`, o último
 * que o job recebe: é quando o grupo passou a existir e a receber gente.
 */
export async function listGroupsCreatedSince(tenantId: string, campaignGroupId: string, desde: string): Promise<GrupoCriado[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("seq,subject,whatsapp_group_id,updated_at")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .eq("status", "created")
    .gte("updated_at", desde)
    .order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrupoCriado[];
}

/** Os mesmos grupos abertos, de todas as campanhas da loja: o "novo 09:14" do mapa da Início. */
export async function listGroupsCreatedSinceByTenant(tenantId: string, desde: string): Promise<GrupoCriado[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("seq,subject,whatsapp_group_id,updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "created")
    .gte("updated_at", desde)
    .order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrupoCriado[];
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
