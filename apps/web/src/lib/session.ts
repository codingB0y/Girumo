import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, parseSession } from "@/lib/auth";
import { isRevoked } from "@/lib/auth/session-revocation-store";

// Le o authUserId do cookie legado dentro de route handlers Node.
// Rotas novas devem preferir Supabase Auth + tenant_id explicito.
export async function getSessionAccountId(): Promise<string | null> {
  return accountIdFromSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Mesma regra do `getTenantContext`: assinatura + prazo e, depois, revogação.
 * Sem esta checagem um cookie encerrado no logout continuava valendo nas rotas
 * de caminho de cookie até os 30 dias do `iat`. Separada do `cookies()` para
 * ser testável fora de um request do Next.
 */
export async function accountIdFromSessionToken(token: string | undefined | null): Promise<string | null> {
  const claims = await parseSession(token);
  if (!claims) return null;
  if (await isRevoked(claims.authUserId, claims.issuedAt)) return null;
  return claims.authUserId;
}
