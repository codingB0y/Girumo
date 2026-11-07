import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * state do OAuth do Melhor Envio: cópia de `bling-oauth-states.ts` com outra tabela e outro cookie. O state
 * inteiro só vive no cookie; aqui fica o sha256 (`hashDoEstado`, de `bling-oauth-states.ts`), preso à loja e
 * a quem pediu, por 10 minutos e para um uso só.
 */

const TABLE = "melhorenvio_oauth_states";

export const COOKIE_DO_ESTADO_ME = "melhorenvio_oauth_state";
/** Só as rotas do Melhor Envio recebem o cookie. */
const CAMINHO_DO_COOKIE = "/api/integracoes/melhor-envio";

/** Lax e não Strict: o retorno é uma navegação vinda do melhorenvio.com.br. Mesmo Path nos dois lados. */
export function cookieDoEstadoMe(valor: string, maxAgeS: number): string {
  return `${COOKIE_DO_ESTADO_ME}=${valor}; Path=${CAMINHO_DO_COOKIE}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}

export async function criarEstadoOAuthMe(e: { stateHash: string; tenantId: string; userId: string; expiraEm: Date }): Promise<void> {
  const supabase = getSupabaseAdmin();
  // Faxina dos cliques em "Conectar" abandonados desta loja; o retorno só apaga o que consome.
  const { error: erroFaxina } = await supabase
    .from(TABLE)
    .delete()
    .eq("tenant_id", e.tenantId)
    .lte("expires_at", new Date().toISOString());
  if (erroFaxina) throw new Error(erroFaxina.message);

  const { error } = await supabase.from(TABLE).insert({
    state_hash: e.stateHash,
    tenant_id: e.tenantId,
    user_id: e.userId,
    expires_at: e.expiraEm.toISOString(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Sem filtro de loja, de propósito: é o hash que diz de que loja é o pedido. `delete … returning` é a trava
 * de uso único: dois retornos com o mesmo state, só um recebe a linha e o code nunca é trocado duas vezes.
 */
export async function consumirEstadoOAuthMe(stateHash: string, agora: Date): Promise<{ tenantId: string; userId: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("state_hash", stateHash)
    .gt("expires_at", agora.toISOString())
    .select("tenant_id, user_id");
  if (error) throw new Error(error.message);
  const linha = (data as Array<{ tenant_id: string; user_id: string }> | null)?.[0];
  return linha ? { tenantId: linha.tenant_id, userId: linha.user_id } : null;
}
