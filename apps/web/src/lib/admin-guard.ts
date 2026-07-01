import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Lista de e-mails com acesso super-admin à plataforma.
 * Em produção, mover para tabela `platform_admins` no Supabase.
 */
const PLATFORM_ADMIN_EMAILS = (
  process.env.PLATFORM_ADMIN_EMAILS ?? "igor@hubflow.com.br"
)
  .split(",")
  .map((e) => e.trim().toLowerCase());

export type AdminContext = {
  authUserId: string;
  email: string;
};

/**
 * Verifica se o usuário autenticado é um super admin da plataforma.
 * Retorna o contexto se sim, null se não.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const authUserId = await verifySession(token);
  if (!authUserId) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.auth.admin.getUserById(authUserId);
  const email = data.user?.email?.toLowerCase();

  if (!email || !PLATFORM_ADMIN_EMAILS.includes(email)) return null;

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
