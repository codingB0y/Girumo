import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionAccountId } from "@/lib/session";

export type Referral = {
  id: string;
  referrer_name: string;
  group_name: string;
  slug: string;
  invite_url: string;
  tenant_id?: string;
  created_at?: string;
};

export type ReferralConfig = {
  reward: string;
  goal: number;
  updated_at?: string;
};

const DEFAULT_CONFIG: ReferralConfig = {
  reward: "Frete grátis no próximo pedido",
  goal: 3,
};

async function getTenantId(): Promise<string> {
  const userId = await getSessionAccountId();
  if (!userId) throw new Error("Não autenticado.");
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new Error("Tenant não encontrado.");
  return data.tenant_id;
}

export async function listReferrals(): Promise<Referral[]> {
  const tenantId = await getTenantId();
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Referral[];
}

export async function createReferral(input: {
  referrerName: string;
  group: string;
  slug: string;
  inviteUrl: string;
}): Promise<Referral> {
  const tenantId = await getTenantId();
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .insert({
      tenant_id: tenantId,
      referrer_name: input.referrerName,
      group_name: input.group,
      slug: input.slug,
      invite_url: input.inviteUrl,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Referral;
}

export async function removeReferral(id: string): Promise<boolean> {
  const tenantId = await getTenantId();
  const { error } = await getSupabaseAdmin()
    .from("referrals")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return !error;
}

export async function getReferralConfig(): Promise<ReferralConfig> {
  const tenantId = await getTenantId();
  const { data } = await getSupabaseAdmin()
    .from("referral_configs")
    .select("reward, goal, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return { reward: data.reward ?? DEFAULT_CONFIG.reward, goal: data.goal ?? DEFAULT_CONFIG.goal, updated_at: data.updated_at };
}

export async function setReferralConfig(partial: Partial<ReferralConfig>): Promise<ReferralConfig> {
  const tenantId = await getTenantId();
  const current = await getReferralConfig();
  const merged = { ...current, ...partial, updated_at: new Date().toISOString() };

  await getSupabaseAdmin()
    .from("referral_configs")
    .upsert(
      { tenant_id: tenantId, reward: merged.reward, goal: merged.goal, updated_at: merged.updated_at },
      { onConflict: "tenant_id" },
    );

  return merged;
}
