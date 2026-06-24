import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Le o authUserId do cookie legado dentro de route handlers Node.
// Rotas novas devem preferir Supabase Auth + tenant_id explicito.
export async function getSessionAccountId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
