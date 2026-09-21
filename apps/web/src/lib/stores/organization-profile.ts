import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ProfileInput } from "@/lib/settings/profile-input";

export type OrganizationProfile = { storeName: string; niche: string | null };

// `organizations` é chaveada pelo próprio tenant: `.eq("id", tenantId)` é o
// filtro de isolamento (service-role bypassa RLS — ver CLAUDE.md).
export async function getOrganizationProfile(tenantId: string): Promise<OrganizationProfile> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("name, niche")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { storeName: data?.name ?? "", niche: data?.niche ?? null };
}

export async function updateOrganizationProfile(
  tenantId: string,
  input: ProfileInput,
): Promise<OrganizationProfile> {
  const patch = {
    ...(input.storeName !== undefined ? { name: input.storeName } : {}),
    ...(input.niche !== undefined ? { niche: input.niche } : {}),
  };
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .update(patch)
    .eq("id", tenantId)
    .select("name, niche")
    .single();
  if (error) throw new Error(error.message);
  return { storeName: data.name, niche: data.niche };
}
