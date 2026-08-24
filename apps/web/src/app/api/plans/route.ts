import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getStripePriceId } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catalogo de planos — global, nao por tenant.
 *
 * A ausencia de `.eq("tenant_id", ...)` aqui e DE PROPOSITO e nao deve ser
 * "corrigida": `plans` e catalogo compartilhado, e as 4 linhas pertencem a uma
 * organizacao sentinela ("HUBFLOW System"). Filtrar por tenant devolveria lista
 * vazia para todas as 21 organizacoes de producao e quebraria o checkout — a
 * unicidade que importa aqui e `plans_code_unique (code)`, nao o tenant.
 *
 * A regra geral do projeto continua valendo para todo o resto: em tabela com
 * `tenant_id`, o filtro explicito E a protecao, porque o service-role bypassa RLS.
 */
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("plans")
    .select("id, code, name, limits, stripe_price_id, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    (data ?? []).map((plan) => ({
      ...plan,
      stripe_price_id: plan.stripe_price_id ?? getStripePriceId(String(plan.code)),
    })),
  );
}
