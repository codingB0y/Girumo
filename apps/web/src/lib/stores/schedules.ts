import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type ScheduleStatus = "pending" | "running" | "done" | "failed";
export type ScheduleRecurrence = "none" | "daily" | "weekly";

export type Schedule = {
  id: string;
  tenant_id: string;
  broadcast_id: string | null;
  campaign_message_id: string | null;
  name: string;
  scheduled_at: string;
  recurrence: ScheduleRecurrence;
  status: ScheduleStatus;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "schedules";

export async function listSchedules(tenantId: string): Promise<Schedule[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("scheduled_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Agendamentos de um conjunto de ofertas — usado pela agenda da campanha. */
export async function listSchedulesByBroadcastIds(
  tenantId: string,
  broadcastIds: readonly string[],
): Promise<Schedule[]> {
  if (broadcastIds.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .in("broadcast_id", [...broadcastIds])
    .order("scheduled_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSchedule(
  tenantId: string,
  input: {
    broadcast_id?: string;
    campaign_message_id?: string;
    name: string;
    scheduled_at: string;
    recurrence?: ScheduleRecurrence;
  },
): Promise<Schedule> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      broadcast_id: input.broadcast_id ?? null,
      campaign_message_id: input.campaign_message_id ?? null,
      name: input.name,
      scheduled_at: input.scheduled_at,
      recurrence: input.recurrence ?? "none",
      status: "pending" as ScheduleStatus,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSchedule(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Promove agendamentos vencidos.
 *
 * @deprecated Só era chamado de dentro de `/api/dispatch/pending` — rota
 * engine-only que a F5 remove. Quem roda isso no motor novo é
 * `promote_due_schedules`, no housekeeping do worker (poll de 3 s). Cron da
 * Vercel não serve: o plano Hobby só faz cron diário.
 *
 * A versão antiga marcava `status='queued'` direto, o que no motor novo NÃO
 * dispara nada (a fila é criada pelo fan-out). Por isso aqui também chama a
 * RPC — enquanto a rota legada existir, os dois caminhos produzem fila de
 * verdade em vez de uma oferta parada em 'queued' para sempre.
 */
export async function processDueSchedules(tenantId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: due, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .lte("scheduled_at", now);

  if (error) throw new Error(error.message);
  if (!due || due.length === 0) return;

  const supabase = getSupabaseAdmin();
  const DAY_MS = 86_400_000;

  for (const s of due) {
    if (s.broadcast_id) {
      const { error: enqueueError } = await supabase.rpc("enqueue_broadcast", {
        target_tenant_id: tenantId,
        target_broadcast_id: s.broadcast_id,
      });
      if (enqueueError) throw new Error(enqueueError.message);
    }

    if (s.recurrence === "none") {
      await supabase.from(TABLE).update({ status: "done", last_run_at: now }).eq("id", s.id);
    } else {
      const step = s.recurrence === "daily" ? DAY_MS : 7 * DAY_MS;
      let next = new Date(s.scheduled_at).getTime();
      const nowMs = Date.now();
      do { next += step; } while (next <= nowMs);
      await supabase.from(TABLE).update({
        scheduled_at: new Date(next).toISOString(),
        last_run_at: now,
      }).eq("id", s.id);
    }
  }
}
