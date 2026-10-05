import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type IgAccount = {
  id: string;
  username: string;
  status: "active" | "expired" | "revoked" | "disconnected";
  provider: "zernio" | "meta";
  provider_account_id: string | null;
  connected_at: string;
};

/** A conta do Instagram da loja. NUNCA seleciona `access_token_enc`. */
export async function getAccount(tenantId: string): Promise<IgAccount | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_accounts")
    .select("id, username, status, provider, provider_account_id, connected_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IgAccount | null) ?? null;
}
