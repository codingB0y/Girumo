import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type ScheduleStatus = "pending" | "running" | "done" | "failed";
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

export async function listPendingSchedules(tenantId: string): Promise<Schedule[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
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

export async function updateSchedule(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Schedule, "status" | "scheduled_at" | "recurrence" | "last_run_at">>,
): Promise<Schedule | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
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

/** Process due schedules — promote pending ones past their time to dispatch */
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
    // Try to enqueue the linked broadcast
    if (s.broadcast_id) {
      await supabase
        .from("broadcasts")
        .update({ status: "queued", sent: 0, error: null, dispatched_at: null, running_since: null, last_ack_at: null })
        .eq("id", s.broadcast_id)
        .in("status", ["draft", "sent", "failed"]);
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
