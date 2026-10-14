import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * state do OAuth do Bling (spec §3 "Conectar" e §8). O state inteiro só vive no cookie;
 * aqui fica o sha256, preso à loja e a quem pediu, por 10 minutos e para um uso só.
 */

const TABLE = "bling_oauth_states";

export const COOKIE_DO_ESTADO = "bling_oauth_state";
/** Só as rotas do Bling recebem o cookie: o conectar grava, o retorno lê e apaga. */
const CAMINHO_DO_COOKIE = "/api/integracoes/bling";

export function hashDoEstado(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

/**
 * Lax e não Strict: o retorno é uma navegação vinda do bling.com.br, e Strict não levaria o
 * cookie. Mesmo Path nos dois lados, senão o Max-Age=0 do retorno não apaga o do conectar.
 */
export function cookieDoEstado(valor: string, maxAgeS: number): string {
  return `${COOKIE_DO_ESTADO}=${valor}; Path=${CAMINHO_DO_COOKIE}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}

export async function criarEstadoOAuth(e: { stateHash: string; tenantId: string; userId: string; expiraEm: Date }): Promise<void> {
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
 * Sem filtro de loja, de propósito: é o hash que diz de que loja é o pedido. O delete …
 * returning é a trava de uso único — dois retornos com o mesmo state, só um recebe a linha,
 * e o segundo nunca troca o code de novo (reusar o code revoga a loja no Bling).
 */
export async function consumirEstadoOAuth(stateHash: string, agora: Date): Promise<{ tenantId: string; userId: string } | null> {
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
