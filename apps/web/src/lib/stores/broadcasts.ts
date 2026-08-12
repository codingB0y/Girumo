import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type BroadcastStatus = "draft" | "queued" | "running" | "sent" | "failed";

export type Broadcast = {
  id: string;
  tenant_id: string;
  campaign_group_id: string | null;
  name: string;
  message: string;
  group_ids: string[];
  media_id: string | null;
  media_type: string | null;
  /** Nome original do arquivo, só p/ exibição na agenda. */
  media_name: string | null;
  mention_all: boolean;
  poll: { question: string; options: string[] } | null;
  status: BroadcastStatus;
  /** Corrida atual do fan-out. Não-nulo = enfileirado pelo worker novo. */
  run_id: string | null;
  sent: number;
  total: number;
  error: string | null;
  dispatched_at: string | null;
  running_since: string | null;
  last_ack_at: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "broadcasts";

export async function listBroadcasts(tenantId: string): Promise<Broadcast[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createBroadcast(
  tenantId: string,
  input: {
    campaign_group_id?: string;
    name: string;
    message: string;
    group_ids: string[];
    media_id?: string;
    media_type?: string;
    media_name?: string;
    mention_all?: boolean;
    poll?: { question: string; options: string[] };
  },
): Promise<Broadcast> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      campaign_group_id: input.campaign_group_id ?? null,
      name: input.name,
      message: input.message,
      group_ids: input.group_ids,
      media_id: input.media_id ?? null,
      media_type: input.media_type ?? null,
      media_name: input.media_name ?? null,
      mention_all: input.mention_all ?? false,
      poll: input.poll ?? null,
      status: "draft" as BroadcastStatus,
      sent: 0,
      total: input.group_ids.length,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listBroadcastsByCampaign(
  tenantId: string,
  campaignGroupId: string,
): Promise<Broadcast[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBroadcast(tenantId: string, id: string): Promise<Broadcast | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Cancela o que ainda dá pra cancelar, sem fingir o que não dá:
 *  - apaga agendamento pendente (nunca chegou a virar fila);
 *  - marca `canceled` só os comandos AINDA `queued` — quem já está `processing`
 *    saiu pro WhatsApp e não volta atrás;
 *  - volta o broadcast pra `draft` apenas se nada tinha saído.
 *
 * Devolve quantos comandos foram barrados e quantos já haviam sido enviados,
 * pra rota poder dizer a verdade ao lojista.
 */
export async function cancelBroadcast(
  tenantId: string,
  id: string,
): Promise<{ canceledCommands: number; alreadySent: number } | null> {
  const supabase = getSupabaseAdmin();
  const broadcast = await getBroadcast(tenantId, id);
  if (!broadcast) return null;

  const { error: scheduleError } = await supabase
    .from("schedules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", id)
    .eq("status", "pending");
  if (scheduleError) throw new Error(scheduleError.message);

  // O fan-out liga comando → oferta por origin_kind/origin_id (não há run_id aqui).
  const { data: canceled, error: commandError } = await supabase
    .from("engine_commands")
    .update({ status: "canceled" })
    .eq("tenant_id", tenantId)
    .eq("origin_kind", "broadcast")
    .eq("origin_id", id)
    .eq("status", "queued")
    .select("id");
  if (commandError) throw new Error(commandError.message);

  if (broadcast.sent === 0) {
    const { error: statusError } = await supabase
      .from(TABLE)
      .update({ status: "draft" as BroadcastStatus })
      .eq("tenant_id", tenantId)
      .eq("id", id);
    if (statusError) throw new Error(statusError.message);
  }

  return { canceledCommands: canceled?.length ?? 0, alreadySent: broadcast.sent };
}

export async function deleteBroadcast(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Dispatch helpers ----

/**
 * Enfileira o disparo: resolve número e grupos e cria 1 comando por grupo em
 * `engine_commands`, que é o que o worker novo consome.
 *
 * Antes isto só marcava `status='queued'` e quem convertia em envio era o engine
 * legado. A assinatura é a mesma de propósito — nenhuma rota precisou mudar.
 *
 * O fan-out inteiro é uma RPC porque são 5 passos que precisam de UMA transação:
 * morrendo no meio sobrariam metade dos comandos e um `total` mentiroso.
 */
export async function enqueueBroadcast(tenantId: string, id: string): Promise<Broadcast | null> {
  const { data, error } = await getSupabaseAdmin().rpc("enqueue_broadcast", {
    target_tenant_id: tenantId,
    target_broadcast_id: id,
  });
  if (error) throw new Error(error.message);
  return (data as Broadcast | null) ?? null;
}

/**
 * @deprecated Motor legado (removido na F5) — o worker novo lê `engine_commands`.
 *
 * O filtro `run_id is null` é o que impede DISPARO DUPLO durante o cutover: com o
 * fan-out, a oferta também entra em 'queued', e sem este filtro o engine legado
 * claimaria a mesma linha e enviaria tudo de novo. Oferta com `run_id` é do motor
 * novo e o legado ignora — por isso os dois podem ficar vivos ao mesmo tempo.
 */
export async function claimPendingBroadcasts(tenantId: string, limit = 10): Promise<Broadcast[]> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "running" as BroadcastStatus,
      running_since: now,
      last_ack_at: now,
    })
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .is("run_id", null)
    .order("created_at", { ascending: true })
    .limit(limit)
    .select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * @deprecated Motor legado (removido na F5). No motor novo quem escreve
 * `sent`/`status` é `reconcile_broadcast_progress`, agregando `engine_commands`
 * no housekeeping do worker — nunca este ack.
 */
export async function ackBroadcast(
  tenantId: string,
  id: string,
  input: { status: "running" | "sent" | "failed"; sent: number; total: number; error?: string | null },
): Promise<Broadcast | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: input.status,
      sent: input.sent,
      total: input.total,
      error: input.error ?? null,
      last_ack_at: now,
      ...(input.status === "sent" || input.status === "failed" ? { dispatched_at: now } : {}),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
