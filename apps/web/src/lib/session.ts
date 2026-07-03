import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Le o authUserId do cookie legado dentro de route handlers Node.
// Rotas novas devem preferir Supabase Auth + tenant_id explicito.
export async function getSessionAccountId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function getSessionTenantId(): Promise<string | null> {
  const accountId = await getSessionAccountId();
  if (!accountId) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", accountId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.tenant_id) return null;
  return data.tenant_id as string;
}
