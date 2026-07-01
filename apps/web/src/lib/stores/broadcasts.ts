import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type BroadcastStatus = "draft" | "queued" | "running" | "sent" | "failed";

export type Broadcast = {
  id: string;
  tenant_id: string;
  campaign_group_id: string | null;
  name: string;
  message: string;
  group_ids: string[];
  media_id: string | null;
  media_type: string | null;
  mention_all: boolean;
  poll: { question: string; options: string[] } | null;
  status: BroadcastStatus;
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

export async function createBroadcast(
  tenantId: string,
  input: {
    campaign_group_id?: string;
    name: string;
    message: string;
    group_ids: string[];
    media_id?: string;
    media_type?: string;
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

export async function updateBroadcast(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Broadcast, "status" | "sent" | "total" | "error" | "dispatched_at" | "running_since" | "last_ack_at">>,
): Promise<Broadcast | null> {
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

export async function deleteBroadcast(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Dispatch helpers ----

export async function enqueueBroadcast(tenantId: string, id: string): Promise<Broadcast | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "queued" as BroadcastStatus,
      sent: 0,
      error: null,
      dispatched_at: null,
      running_since: null,
      last_ack_at: null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .in("status", ["draft", "sent", "failed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Engine claims pending broadcasts (atomically via update ... returning) */
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
    .order("created_at", { ascending: true })
    .limit(limit)
    .select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Engine acks progress/completion */
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
