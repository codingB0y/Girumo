import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type AccountStatus = "active" | "expired" | "revoked" | "disconnected";

export type IgAccount = {
  id: string;
  username: string;
  status: AccountStatus;
  provider: "zernio" | "meta";
  provider_account_id: string | null;
  provider_profile_id: string | null;
  connected_at: string;
};
export type IgAccountComLoja = IgAccount & { tenant_id: string };

/** NUNCA seleciona `access_token_enc`. */
const COLS = "id, username, status, provider, provider_account_id, provider_profile_id, connected_at";

/** A conta do Instagram da loja. */
export async function getAccount(tenantId: string): Promise<IgAccount | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_accounts").select(COLS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as IgAccount | null) ?? null;
}

export type NovaConta = { providerAccountId: string; providerProfileId: string; username: string };

/**
 * Uma conta por loja (índice único em tenant_id): conectar de novo regrava a
 * linha. `null` = esta conta da Zernio já está em outra loja (índice único em
 * provider_account_id, ou em ig_user_id).
 */
export async function upsertAccount(tenantId: string, input: NovaConta): Promise<IgAccount | null> {
  const agora = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("ig_accounts")
    .upsert(
      {
        tenant_id: tenantId,
        provider: "zernio",
        provider_account_id: input.providerAccountId,
        provider_profile_id: input.providerProfileId,
        // A listagem da Zernio não expõe o id escopado do Instagram da loja; a
        // coluna é obrigatória e única, então leva o id da conta na Zernio.
        ig_user_id: `zernio:${input.providerAccountId}`,
        username: input.username,
        status: "active",
        last_error: null,
        webhook_subscribed: true,
        connected_at: agora,
        updated_at: agora,
      },
      { onConflict: "tenant_id" },
    )
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data as unknown as IgAccount;
}

/**
 * Só o webhook usa: a Zernio manda o id da conta, não a loja. É a ÚNICA leitura
 * deste módulo sem `tenant_id`; o índice único em provider_account_id garante
 * no máximo uma linha, e quem chama trata `null` como "não é nosso" (202).
 */
export async function getAccountByProviderId(providerAccountId: string): Promise<IgAccountComLoja | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_accounts").select(`tenant_id, ${COLS}`).eq("provider_account_id", providerAccountId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as IgAccountComLoja | null) ?? null;
}

export async function setAccountStatus(tenantId: string, status: AccountStatus, lastError: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_accounts").update({ status, last_error: lastError, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
