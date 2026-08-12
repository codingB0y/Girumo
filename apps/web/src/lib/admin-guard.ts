import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isPlatformAdminEmail } from "@/lib/admin/platform-admins";

export type AdminContext = {
  authUserId: string;
  email: string;
};

/**
 * E-mail do usuário se ele for super-admin AGORA; null caso contrário.
 *
 * Separado de `getAdminContext` porque nem todo caminho tem o admin no cookie de
 * sessão: ao encerrar uma impersonation a sessão ativa é a do lojista, e o admin
 * só existe como id dentro do cookie assinado — que prova quem começou, não que
 * essa pessoa continua na lista.
 *
 * Falha fechada: erro do Supabase ou usuário sem e-mail devolve null.
 * Em produção, mover a lista para tabela `platform_admins` no Supabase.
 */
export async function adminEmailFor(authUserId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.auth.admin.getUserById(authUserId);
  const email = data.user?.email?.toLowerCase();
  return isPlatformAdminEmail(email) ? (email as string) : null;
}

/**
 * Verifica se o usuário autenticado é um super admin da plataforma.
 * Retorna o contexto se sim, null se não.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const authUserId = await verifySession(token);
  if (!authUserId) return null;

  const email = await adminEmailFor(authUserId);
  if (!email) return null;

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
