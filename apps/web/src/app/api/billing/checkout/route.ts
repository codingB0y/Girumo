import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getStripePriceId, normalizePlanCode } from "@/lib/billing/plans";
import { resolveTenantCustomerId } from "@/lib/billing/tenant-customer";
import { checkoutSessionParams, trialCheckoutDecision } from "@/lib/billing/checkout-session";
import { trialEnabled } from "@/lib/billing/trial";
import { readTrialFacts } from "@/lib/billing/trial-facts";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const body = (await req.json().catch(() => ({}))) as { planCode?: string; semTeste?: boolean };
    const planCode = normalizePlanCode(body.planCode);

    const supabase = getSupabaseAdmin();
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id, code, name, stripe_price_id")
      .eq("code", planCode)
      .eq("active", true)
      .single();

    if (planError || !plan) return Response.json({ error: "Plano nao encontrado." }, { status: 404 });

    const priceId = (plan.stripe_price_id as string | null) ?? getStripePriceId(planCode);

    if (!priceId) {
      return Response.json({ error: "Plano pago invalido ou sem Stripe Price ID." }, { status: 400 });
    }

    // O cliente não pede teste: o servidor aplica quando a conta é elegível. O único
    // pedido aceito é o contrário — "sem teste", que é o caminho do boleto. Com a
    // flag desligada, é o checkout de antes do teste (ver `trialCheckoutDecision`).
    const decisao = await trialCheckoutDecision({
      enabled: trialEnabled(process.env.BILLING_TRIAL_ENABLED),
      semTeste: body.semTeste,
      readFacts: () => readTrialFacts(supabase, ctx.tenantId),
    });
    // A frase diz ONDE está o botão: ela também aparece no paywall, que não tem
    // "Gerenciar cobrança" — só Configurações › Plano tem.
    if (decisao === "em_teste") {
      return Response.json(
        { error: "Você está no teste grátis. Para trocar de plano, use Gerenciar cobrança em Configurações › Plano." },
        { status: 409 },
      );
    }
    const comTeste = decisao === "com_teste";

    const stripe = getStripe();

    const customerId = await resolveTenantCustomerId({
      supabase,
      stripe,
      tenantId: ctx.tenantId,
      email: ctx.email ?? null,
      authUserId: ctx.authUserId,
    });

    const appUrl = getAppUrl();
    // Sem idempotencyKey de proposito: uma chave estavel por tenant+plano
    // devolveria a MESMA sessao dentro das 24h em que o Stripe guarda a chave,
    // e quem ja tivesse pago cairia de volta numa sessao concluida. Sessao
    // sobrando expira sozinha; customer sobrando fica para sempre — por isso a
    // chave esta so na criacao do Customer.
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        customerId,
        priceId,
        appUrl,
        tenantId: ctx.tenantId,
        planId: String(plan.id),
        planCode,
        comTeste,
      }),
    );

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "stripe.checkout.created",
      message: `Checkout Stripe criado para o plano ${planCode}.`,
      metadata: { checkout_session_id: session.id, plan_code: planCode, com_teste: comTeste },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Erro ao criar checkout." }, { status: 500 });
  }
}
