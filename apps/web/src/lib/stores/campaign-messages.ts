import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type CampaignMessageType = "text" | "image" | "video" | "audio" | "file" | "poll";
export type CampaignMessageStatus = "draft" | "scheduled" | "queued" | "running" | "sent" | "failed";
export type ScheduleRecurrence = "none" | "daily" | "weekly";

export type CampaignMessage = {
  id: string;
  tenant_id: string;
  campaign_group_id: string;
  campaign_slug: string;
  type: CampaignMessageType;
  body: string;
  group_ids: string[];
  media_id: string | null;
  media_type: string | null;
  media_name: string | null;
  poll: { question: string; options: string[] } | null;
  mention_all: boolean;
  scheduled_at: string | null;
  recurrence: ScheduleRecurrence;
  status: CampaignMessageStatus;
  sent: number;
  total: number;
  error: string | null;
  dispatched_at: string | null;
  running_since: string | null;
  last_ack_at: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "campaign_messages";

export async function listByCampaignGroup(tenantId: string, campaignGroupId: string): Promise<CampaignMessage[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("campaign_group_id", campaignGroupId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listScheduledMessages(tenantId: string): Promise<CampaignMessage[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCampaignMessage(
  tenantId: string,
  input: {
    campaign_group_id: string;
    campaign_slug: string;
    type: CampaignMessageType;
    body: string;
    group_ids: string[];
    media_id?: string;
    media_type?: string;
    media_name?: string;
    poll?: { question: string; options: string[] };
    mention_all?: boolean;
    scheduled_at?: string;
    recurrence?: ScheduleRecurrence;
  },
): Promise<CampaignMessage> {
  const isScheduled = Boolean(input.scheduled_at);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      campaign_group_id: input.campaign_group_id,
      campaign_slug: input.campaign_slug,
      type: input.type,
      body: input.body,
      group_ids: input.group_ids,
      media_id: input.media_id ?? null,
      media_type: input.media_type ?? null,
      media_name: input.media_name ?? null,
      poll: input.poll ?? null,
      mention_all: input.mention_all ?? false,
      scheduled_at: input.scheduled_at ?? null,
      recurrence: input.recurrence ?? "none",
      status: isScheduled ? "scheduled" : "draft",
      sent: 0,
      total: input.group_ids.length,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCampaignMessage(
  tenantId: string,
  id: string,
  patch: Partial<Pick<CampaignMessage, "status" | "sent" | "total" | "error" | "scheduled_at" | "recurrence" | "dispatched_at" | "running_since" | "last_ack_at">>,
): Promise<CampaignMessage | null> {
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

export async function deleteCampaignMessage(tenantId: string, id: string): Promise<boolean> {
  const { error, count } = await getSupabaseAdmin()
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .in("status", ["draft", "sent", "failed"]);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function cancelCampaignMessage(tenantId: string, id: string): Promise<CampaignMessage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "draft" as CampaignMessageStatus })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Enqueue a message for immediate dispatch */
export async function enqueueCampaignMessage(tenantId: string, id: string): Promise<CampaignMessage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "queued" as CampaignMessageStatus,
      running_since: null,
      last_ack_at: null,
      dispatched_at: null,
      error: null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .in("status", ["draft", "scheduled", "sent", "failed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Process due scheduled messages → enqueue them */
export async function processDueScheduledMessages(tenantId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: due, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (error) throw new Error(error.message);
  if (!due || due.length === 0) return;

  const DAY_MS = 86_400_000;
  const supabase = getSupabaseAdmin();

  for (const msg of due) {
    // Enqueue
    await supabase
      .from(TABLE)
      .update({ status: "queued", error: null, dispatched_at: null, running_since: null, last_ack_at: null })
      .eq("id", msg.id);

    // If recurrent, create next occurrence
    if (msg.recurrence !== "none" && msg.scheduled_at) {
      const step = msg.recurrence === "daily" ? DAY_MS : 7 * DAY_MS;
      let next = new Date(msg.scheduled_at).getTime();
      const nowMs = Date.now();
      do { next += step; } while (next <= nowMs);

      await supabase.from(TABLE).insert({
        tenant_id: tenantId,
        campaign_group_id: msg.campaign_group_id,
        campaign_slug: msg.campaign_slug,
        type: msg.type,
        body: msg.body,
        group_ids: msg.group_ids,
        media_id: msg.media_id,
        media_type: msg.media_type,
        media_name: msg.media_name,
        poll: msg.poll,
        mention_all: msg.mention_all,
        scheduled_at: new Date(next).toISOString(),
        recurrence: msg.recurrence,
        status: "scheduled",
        sent: 0,
        total: msg.total,
      });
    }
  }
}
