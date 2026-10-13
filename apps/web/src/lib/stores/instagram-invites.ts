import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Convite nominal do add-on Instagram. Toda query filtra `tenant_id`. */
export type InstagramInvite = {
  id: string;
  tenant_id: string;
  discount_percent: number;
  stripe_coupon_id: string | null;
  expires_at: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  used_at: string | null;
  stripe_subscription_id: string | null;
};

/** NUNCA seleciona `token_hash`. */
const COLS = "id, tenant_id, discount_percent, stripe_coupon_id, expires_at, created_by, created_at, revoked_at, used_at, stripe_subscription_id";

export type NovoConvite = {
  id: string;
  tokenHash: string;
  discountPercent: number;
  stripeCouponId: string | null;
  expiresAt: string;
  createdBy: string;
};

export async function createInvite(tenantId: string, c: NovoConvite): Promise<InstagramInvite> {
  const { data, error } = await getSupabaseAdmin()
    .from("instagram_invites")
    .insert({ id: c.id, tenant_id: tenantId, token_hash: c.tokenHash, discount_percent: c.discountPercent, stripe_coupon_id: c.stripeCouponId, expires_at: c.expiresAt, created_by: c.createdBy })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as InstagramInvite;
}

/** Revoga o convite aberto da loja (no máximo um, pelo índice) e devolve o que revogou, para apagar o cupom. */
export async function revokeOpenInvites(tenantId: string): Promise<InstagramInvite[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("instagram_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .is("used_at", null)
    .select(COLS);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InstagramInvite[];
}

export async function listInvites(tenantId: string): Promise<InstagramInvite[]> {
  const { data, error } = await getSupabaseAdmin().from("instagram_invites").select(COLS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InstagramInvite[];
}

/** O convite do link, só se for desta loja, aberto e no prazo. */
export async function getOpenInviteByHash(tenantId: string, tokenHash: string, agoraIso: string): Promise<InstagramInvite | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("instagram_invites")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .is("used_at", null)
    .gt("expires_at", agoraIso)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as InstagramInvite | null) ?? null;
}

/** O webhook marca quando a assinatura do convite ficou ativa. Só se ainda aberto. */
export async function markInviteUsed(tenantId: string, inviteId: string, subscriptionId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("instagram_invites")
    .update({ used_at: new Date().toISOString(), stripe_subscription_id: subscriptionId })
    .eq("tenant_id", tenantId)
    .eq("id", inviteId)
    .is("used_at", null)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
