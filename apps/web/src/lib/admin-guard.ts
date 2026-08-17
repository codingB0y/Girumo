import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  isAdminFromQuery,
  normalizePlatformAdmins,
  type PlatformAdmin,
} from "@/lib/admin/platform-admins";

export type AdminContext = {
  authUserId: string;
  email: string;
};

/**
 * `true` se este `auth_user_id` é super-admin da plataforma AGORA.
 *
 * Separado de `getAdminContext` porque nem todo caminho tem o admin no cookie de
 * sessão: ao encerrar uma impersonation a sessão ativa é a do lojista, e o admin
 * só existe como id dentro do cookie assinado — que prova quem começou, não que
 * essa pessoa continua autorizada.
 *
 * A autorização é por identidade contra `platform_admins`, nunca por e-mail. O
 * signup cria conta com `email_confirm: true` sem verificar posse do endereço,
 * então uma allowlist de e-mails podia ser reivindicada por quem registrasse o
 * endereço primeiro.
 *
 * Falha fechada: erro de leitura (tabela ausente, rede, permissão) nega o acesso.
 */
export async function isPlatformAdmin(authUserId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  return isAdminFromQuery(result);
}

/**
 * Verifica se o usuário autenticado é um super admin da plataforma.
 * Retorna o contexto se sim, null se não.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const authUserId = await verifySession(token);
  if (!authUserId) return null;

  if (!(await isPlatformAdmin(authUserId))) return null;

  // O e-mail vem do Auth (fonte de verdade) e serve só como rótulo de auditoria —
  // a decisão de acesso já foi tomada acima, por identidade. Um admin sem e-mail
  // no Auth continua admin: negar aqui faria o rótulo virar critério de novo.
  const supabase = getSupabaseAdmin();
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
 * Os super-admins cadastrados, para leitura humana em `/admin/configuracoes`.
 * Service-role: a tabela é deny-all para anon/authenticated.
 */
export async function listPlatformAdmins(): Promise<PlatformAdmin[]> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("platform_admins")
    .select("auth_user_id, email, note")
    .order("created_at");

  return normalizePlatformAdmins(result);
}
