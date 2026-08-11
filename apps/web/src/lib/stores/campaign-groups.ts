import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type CampaignGroup = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  group_ids: string[];
  auto_grow: boolean;
  grow_template: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "campaign_groups";

export async function listCampaignGroups(tenantId: string): Promise<CampaignGroup[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCampaignGroupById(tenantId: string, id: string): Promise<CampaignGroup | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCampaignGroupBySlug(tenantId: string, slug: string): Promise<CampaignGroup | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createCampaignGroup(
  tenantId: string,
  input: { name: string; slug: string; group_ids?: string[]; auto_grow?: boolean; grow_template?: Record<string, unknown> },
): Promise<CampaignGroup> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      name: input.name,
      slug: input.slug,
      group_ids: input.group_ids ?? [],
      auto_grow: input.auto_grow ?? false,
      grow_template: input.grow_template ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCampaignGroup(
  tenantId: string,
  id: string,
  patch: Partial<Pick<CampaignGroup, "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata">>,
): Promise<CampaignGroup | null> {
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

export async function deleteCampaignGroup(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
