import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isSessionRevoked } from "./session-revocation";

/**
 * Acesso a `session_revocations`. A regra de comparação vive em
 * `session-revocation.ts`, que é puro e testável; aqui só há I/O.
 */

/**
 * Marca todas as sessões do usuário como inválidas a partir de agora.
 *
 * Usado pelo logout server-side. `upsert` porque o normal é o usuário nunca ter
 * revogado antes — e revogar de novo é só empurrar o corte para frente.
 */
export async function revokeSessions(authUserId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("session_revocations")
    .upsert(
      { auth_user_id: authUserId, revoked_before: now, updated_at: now },
      { onConflict: "auth_user_id" },
    );

  if (error) throw new Error(`revokeSessions: ${error.message}`);
}

/**
 * O cookie foi revogado?
 *
 * FALHA ABERTO em erro de banco, de propósito: um Supabase intermitente
 * derrubaria todo mundo ao mesmo tempo, e o custo disso é maior que o da
 * janela em que um token revogado ainda passa. A sessão continua limitada pelos
 * 30 dias do `iat` e por toda a checagem de tenant que vem depois.
 */
export async function isRevoked(authUserId: string, issuedAt: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("session_revocations")
    .select("revoked_before")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    console.error("[auth] falha ao consultar session_revocations:", error.message);
    return false;
  }

  return isSessionRevoked(issuedAt, data?.revoked_before ?? null);
}
