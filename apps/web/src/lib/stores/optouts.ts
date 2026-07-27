import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Lista de descadastro (LGPD).
 *
 * Bloqueia a CAPTURA do lead, não apenas o envio — regra já vigente em
 * `/api/leads`, que devolve `skipped: "opt-out"` sem gravar nada. Vale mesmo
 * sem mensagens privadas: quem pediu para sair não entra na base.
 */

export type OptOut = {
  id: string;
  tenant_id: string;
  phone: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "optouts";

/** O opt-out compara só dígitos: o mesmo número pode chegar em vários formatos. */
export function onlyDigits(value: string): string {
  return String(value).replace(/\D/g, "");
}

export async function listOptOuts(tenantId: string): Promise<OptOut[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OptOut[];
}

export async function addOptOut(
  tenantId: string,
  phone: string,
  reason?: string,
): Promise<OptOut> {
  const digits = onlyDigits(phone);
  if (!digits) throw new Error("Telefone inválido para opt-out.");

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      { tenant_id: tenantId, phone: digits, reason: reason?.trim() || null },
      { onConflict: "tenant_id,phone" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as OptOut;
}

export async function removeOptOut(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** Checagem usada antes de capturar um lead. Telefone vazio nunca está no opt-out. */
export async function isOptedOut(tenantId: string, phone: string): Promise<boolean> {
  const digits = onlyDigits(phone);
  if (!digits) return false;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone", digits)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
