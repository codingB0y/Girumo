import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type CampaignMessageType = "text" | "image" | "video" | "audio" | "file" | "poll";
type CampaignMessageStatus = "draft" | "scheduled" | "queued" | "running" | "sent" | "failed";
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

/** Cancela um agendamento (volta pra draft) — escopado por tenant. */
export async function cancelCampaignMessage(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "draft" as CampaignMessageStatus })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .in("status", ["scheduled", "queued"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
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
