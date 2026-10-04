import { trialEnabled, trialView, type TrialView } from "@/lib/billing/trial";
import { readTrialFacts } from "@/lib/billing/trial-facts";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flag desligada: nada a oferecer, e nada a ler. */
const SEM_OFERTA: TrialView = { elegivel: false, emTeste: null, cartaoRepetido: false };

/**
 * GET /api/billing/trial — o que as telas do teste grátis precisam saber
 * (spec 2026-10-03, 4.2): se a conta pode testar, se está testando e se o
 * cartão já tinha sido usado num teste.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    if (!trialEnabled(process.env.BILLING_TRIAL_ENABLED)) return Response.json(SEM_OFERTA);
    const facts = await readTrialFacts(getSupabaseAdmin(), ctx.tenantId);
    return Response.json(trialView(facts));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Nao foi possivel ler o teste gratis." }, { status: 500 });
  }
}
