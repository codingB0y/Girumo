import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type AdminContext = {
  authUserId: string;
  email: string;
};

/**
 * Verifica se o usuário autenticado é um super admin da plataforma.
 * Retorna o contexto se sim, null se não.
 *
 * Autorização é por `auth_user_id` contra `platform_admins` — nunca por e-mail.
 * O signup cria conta com `email_confirm: true` sem verificar posse do endereço,
 * então uma allowlist de e-mails podia ser reivindicada por quem registrasse o
 * endereço primeiro. O `auth_user_id` só existe depois da conta e não é adivinhável.
 *
 * Fail-closed: qualquer falha de leitura (tabela ausente, erro de rede, permissão)
 * nega o acesso em vez de liberar.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const authUserId = await verifySession(token);
  if (!authUserId) return null;

  const supabase = getSupabaseAdmin();
  const { data: adminRow, error } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !adminRow) return null;

  // O e-mail do contexto vem do Auth (fonte de verdade) e serve só para log de
  // auditoria — a decisão de acesso já foi tomada acima.
  const { data } = await supabase.auth.admin.getUserById(authUserId);
  const email = data.user?.email?.toLowerCase() ?? "";

  return { authUserId, email };
}

/**
 * Verifica acesso admin e redireciona se não autorizado.
 * Para uso em Server Components.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect("/login?next=/admin");
  }
  // redirect() throws so this is unreachable, but satisfies TS
  return ctx as AdminContext;
}

/**
 * Lista os super-admins cadastrados. Server-side, service-role.
 */
export async function listPlatformAdmins(): Promise<
  { authUserId: string; email: string | null; note: string | null }[]
> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("platform_admins")
    .select("auth_user_id, email, note")
    .order("created_at");

  if (error || !data) return [];

  return data.map((row) => ({
    authUserId: row.auth_user_id as string,
    email: (row.email as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  }));
}
