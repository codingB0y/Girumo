/**
 * Descoberta dos tenants que podem ter grupo a criar (auto-grow).
 *
 * As rotas `/api/groups/grow/pending` e `/ack` são POR TENANT (`x-tenant-id`),
 * herança do tempo em que a engine Baileys servia um lojista só. O worker é
 * multi-tenant, então precisa saber em quem bater.
 *
 * A pergunta "quem PODE ter job" é respondida por uma leitura trivial — quais
 * campanhas têm `auto_grow` ligado. A pergunta "quem DEVE ter job" continua
 * inteira do lado do app (`evaluateAutoGrow`), que é o gate provado no PR #90:
 * headroom do pool, convite preenchido e 1 job por campanha em voo. Duplicar
 * essa decisão aqui seria reabrir a prova de 4 casos que já foi feita.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deduplica e ordena os tenant_id das linhas devolvidas pela query.
 *
 * Um tenant com N campanhas de auto-grow aparece N vezes — sem o dedupe ele
 * seria varrido N vezes por ciclo, e como o teto anti-ban é "1 criação por
 * tenant por ciclo", isso multiplicaria o teto por N em silêncio.
 *
 * A ordenação existe para o ciclo ser estável entre execuções: com o teto por
 * ciclo, uma ordem que muda a cada tick faria um tenant azarado ficar sempre
 * para trás. Sem I/O, para rodar sob `tsx --test`.
 */
export function distinctTenantIds(rows: readonly { tenant_id?: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = row.tenant_id;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return [...ids].sort();
}

/** Tenants distintos com ao menos uma campanha de auto-grow ligada. */
export async function listGrowTenants(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaign_groups")
    .select("tenant_id")
    .eq("auto_grow", true);
  if (error) throw new Error(`listGrowTenants: ${error.message}`);
  return distinctTenantIds(data ?? []);
}
