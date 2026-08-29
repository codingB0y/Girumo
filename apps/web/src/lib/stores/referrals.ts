import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Referral = {
  id: string;
  tenant_id: string;
  referrer_name: string;
  group_name: string;
  slug: string;
  invite_url: string;
  created_at?: string;
};

export type ReferralConfig = {
  reward: string;
  goal: number;
  updated_at?: string;
};

/** Mesmos defaults do DDL de `referral_configs` — tenant sem linha cai aqui. */
export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  reward: "Frete grátis no próximo pedido",
  goal: 3,
};

/**
 * O `tenantId` vem SEMPRE de fora (a rota resolve com `resolveSessionTenantId`,
 * que honra `x-tenant-id`). Este store já teve uma cópia própria da query de
 * membership, sem esse header — quem pertence a duas organizações ficava preso
 * na mais antiga e não enxergava as indicações da outra.
 *
 * O filtro `.eq("tenant_id")` abaixo É o isolamento: service-role bypassa RLS.
 */
export async function listReferrals(tenantId: string): Promise<Referral[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Referral[];
}

export async function createReferral(
  tenantId: string,
  input: { referrerName: string; group: string; slug: string; inviteUrl: string },
): Promise<Referral> {
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .insert({
      tenant_id: tenantId,
      referrer_name: input.referrerName,
      group_name: input.group,
      slug: input.slug,
      invite_url: input.inviteUrl,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Referral;
}

/**
 * Devolve a linha apagada, ou `null` quando nada casou (id de outro tenant ou
 * inexistente). O booleano de antes era descartado pela rota, que respondia
 * `ok: true` mesmo sem ter apagado nada — e quem chama precisa do `slug` pra
 * derrubar o link rastreado junto.
 */
export async function removeReferral(tenantId: string, id: string): Promise<Referral | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("referrals")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Referral | null) ?? null;
}

export async function getReferralConfig(tenantId: string): Promise<ReferralConfig> {
  const { data, error } = await getSupabaseAdmin()
    .from("referral_configs")
    .select("reward, goal, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...DEFAULT_REFERRAL_CONFIG };
  return {
    reward: data.reward ?? DEFAULT_REFERRAL_CONFIG.reward,
    goal: data.goal ?? DEFAULT_REFERRAL_CONFIG.goal,
    updated_at: data.updated_at,
  };
}

export async function setReferralConfig(
  tenantId: string,
  partial: Partial<Pick<ReferralConfig, "reward" | "goal">>,
): Promise<ReferralConfig> {
  const current = await getReferralConfig(tenantId);
  const merged: ReferralConfig = {
    reward: partial.reward ?? current.reward,
    goal: partial.goal ?? current.goal,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseAdmin()
    .from("referral_configs")
    .upsert(
      { tenant_id: tenantId, reward: merged.reward, goal: merged.goal, updated_at: merged.updated_at },
      { onConflict: "tenant_id" },
    );
  // Silenciar aqui devolveria pro painel um valor que o banco não guardou.
  if (error) throw new Error(error.message);

  return merged;
}
