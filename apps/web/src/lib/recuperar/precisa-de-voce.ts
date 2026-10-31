import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Conversas da loja que esperam resposta (head+count, sem puxar as linhas: o
 * PostgREST trunca em 1000 sem erro). Falha de leitura ou resposta sem número
 * lançam — o contador nunca vira 0 por um erro que ninguém viu.
 */
export async function contarPrecisaDeVoce(tenantId: string): Promise<number> {
  const { count, error, status } = await getSupabaseAdmin()
    .from("private_conversations")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "precisa_de_voce");
  if (error) throw new Error(error.message || `HTTP ${status}`);
  if (count === null || !Number.isInteger(count)) throw new Error(`HTTP ${status} sem contagem`);
  return count;
}
