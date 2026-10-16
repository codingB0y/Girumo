import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * O alerta de reconectar quando o e-mail não sai (spec §3 "Token"): `marcarAlertaReconectar`
 * (`bling-conexoes.ts`) marca antes de mandar, para o e-mail sair uma vez por queda; se nenhum saiu,
 * a marca volta e o cron reenvia. A conexão em si está em `bling-conexoes.ts`.
 */

const TABLE = "bling_connections";

/** Nenhum e-mail saiu: a loja volta a "sem alerta", e o cron tenta de novo. */
export async function desmarcarAlertaReconectar(tenantId: string): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ reconnect_alerted_at: null, updated_at: agora })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/**
 * Para o cron: as lojas paradas em "reconectar" cujo e-mail não saiu. Sem filtro de loja de
 * propósito (como `listarConexoesParaSincronizar`): só o id sai daqui.
 * ponytail: o PostgREST corta em 1000 linhas; paginar quando houver mais de 1000 lojas sem alerta.
 */
export async function listarReconectarSemAlerta(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("tenant_id")
    .eq("status", "reconectar")
    .is("reconnect_alerted_at", null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ tenant_id: string }>).map((l) => l.tenant_id);
}
