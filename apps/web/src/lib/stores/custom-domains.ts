import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "custom_domains";
const COLS = "tenant_id, hostname, verification_token, status, last_error, checked_at, verified_at";
const UNIQUE_VIOLATION = "23505";

export type CustomDomainStatus = "pending" | "active";

export type CustomDomain = {
  tenantId: string;
  hostname: string;
  verificationToken: string;
  status: CustomDomainStatus;
  lastError: string | null;
  checkedAt: string | null;
  verifiedAt: string | null;
};

type Row = {
  tenant_id: string;
  hostname: string;
  verification_token: string;
  status: CustomDomainStatus;
  last_error: string | null;
  checked_at: string | null;
  verified_at: string | null;
};

function toDomain(r: Row): CustomDomain {
  return {
    tenantId: r.tenant_id,
    hostname: r.hostname,
    verificationToken: r.verification_token,
    status: r.status,
    lastError: r.last_error,
    checkedAt: r.checked_at,
    verifiedAt: r.verified_at,
  };
}

export async function getCustomDomain(tenantId: string): Promise<CustomDomain | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDomain(data as Row) : null;
}

/**
 * Dono de um host ATIVO — `null` para host desconhecido ou ainda pendente.
 *
 * Única consulta desta tabela SEM `.eq("tenant_id")`, e de propósito: é ela que
 * descobre o tenant a partir do host. Devolve só o id, e só de linha ativa — o
 * índice único parcial `custom_domains_hostname_ativo` garante no máximo uma.
 */
export async function getActiveDomainTenant(hostname: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("tenant_id")
    .eq("hostname", hostname)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { tenant_id: string } | null)?.tenant_id ?? null;
}

export type ClaimResult = { ok: true; domain: CustomDomain } | { ok: false; reason: "exists" };

/** Cadastra pendente. Um domínio por conta: o segundo cai no unique de `tenant_id`. */
export async function claimCustomDomain(
  tenantId: string,
  hostname: string,
  verificationToken: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({ tenant_id: tenantId, hostname, verification_token: verificationToken, status: "pending" })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "exists" };
    throw new Error(error.message);
  }
  return { ok: true, domain: toDomain(data as Row) };
}

export type SaveResult = { ok: true; domain: CustomDomain } | { ok: false; reason: "taken" | "gone" };

/**
 * Grava o resultado de uma verificação. `taken` = outro tenant já ativou este
 * host (o índice parcial recusou); `gone` = a linha sumiu no meio do caminho.
 */
export async function saveVerification(
  tenantId: string,
  patch: { status: CustomDomainStatus; lastError: string | null },
): Promise<SaveResult> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: patch.status,
      last_error: patch.lastError,
      checked_at: now,
      verified_at: patch.status === "active" ? now : null,
    })
    .eq("tenant_id", tenantId)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "taken" };
    throw new Error(error.message);
  }
  return data ? { ok: true, domain: toDomain(data as Row) } : { ok: false, reason: "gone" };
}

export async function deleteCustomDomain(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
