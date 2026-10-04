import { trialEnabled, trialView, type TrialView } from "@/lib/billing/trial";
import { readTrialFacts } from "@/lib/billing/trial-facts";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext, type TenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flag desligada: nada a oferecer, e nada a ler. */
const SEM_OFERTA: TrialView = { elegivel: false, emTeste: null, cartaoRepetido: false };

/** A mesma régua do checkout: quem o checkout recusaria com 403 não pode assinar. */
function podeAssinar(ctx: TenantContext): boolean {
  try {
    assertBillingRole(ctx);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/billing/trial — o que as telas do teste grátis precisam saber
 * (spec 2026-10-03, 4.2): se a conta pode testar, se está testando e se o
 * cartão já tinha sido usado num teste.
 *
 * A oferta só vai para quem pode pagar (owner/admin): o operador veria o modal
 * abrir e tomaria "Checkout indisponível.". Teste em andamento e cartão repetido
 * continuam visíveis para todo membro — são o estado da conta, não um convite.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    if (!trialEnabled(process.env.BILLING_TRIAL_ENABLED)) return Response.json(SEM_OFERTA);
    const facts = await readTrialFacts(getSupabaseAdmin(), ctx.tenantId);
    const view = trialView(facts);
    return Response.json(podeAssinar(ctx) ? view : { ...view, elegivel: false });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Nao foi possivel ler o teste gratis." }, { status: 500 });
  }
}
