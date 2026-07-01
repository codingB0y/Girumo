import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type TrackedLink = {
  id: string;
  tenant_id: string;
  campaign_group_id: string | null;
  slug: string;
  target_url: string;
  clicks: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "tracked_links";

export async function listTrackedLinks(tenantId: string): Promise<TrackedLink[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTrackedLinkBySlug(slug: string): Promise<TrackedLink | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createTrackedLink(
  tenantId: string,
  input: { campaign_group_id?: string; slug: string; target_url: string },
): Promise<TrackedLink> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      campaign_group_id: input.campaign_group_id ?? null,
      slug: input.slug,
      target_url: input.target_url,
      clicks: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function incrementClicks(slug: string): Promise<TrackedLink | null> {
  const { data, error } = await getSupabaseAdmin().rpc("increment_tracked_link_clicks", { target_slug: slug });
  // Fallback if RPC doesn't exist: manual increment
  if (error) {
    const link = await getTrackedLinkBySlug(slug);
    if (!link) return null;
    const { data: updated, error: updateError } = await getSupabaseAdmin()
      .from(TABLE)
      .update({ clicks: link.clicks + 1 })
      .eq("id", link.id)
      .select("*")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    return updated;
  }
  return data;
}

export async function deleteTrackedLink(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
