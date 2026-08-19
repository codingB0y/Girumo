import { cookies } from "next/headers";
import { SESSION_COOKIE, parseSession } from "@/lib/auth";
import { revokeSessions } from "@/lib/auth/session-revocation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout — encerra a sessão de verdade.
 *
 * Apagar o cookie só limpa ESTE navegador: o token continuava válido pelos 30
 * dias do `iat`, e uma cópia dele (outro dispositivo, um log, um backup)
 * seguiria entrando. Agora o logout também marca o corte em
 * `session_revocations`, e todo token emitido antes dele passa a ser recusado.
 *
 * Sempre responde ok: o usuário pediu para sair, e falhar aqui só o deixaria
 * preso numa sessão que ele quer encerrar. Se a revogação falhar, o cookie
 * ainda some deste navegador e o erro fica no log.
 */
export async function POST() {
  const jar = await cookies();
  const claims = await parseSession(jar.get(SESSION_COOKIE)?.value);

  if (claims) {
    try {
      await revokeSessions(claims.authUserId);
    } catch (error) {
      console.error("[auth] logout: falha ao revogar sessoes:", error);
    }
  }

  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
