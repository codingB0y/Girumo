import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getStripePriceId, normalizePlanCode } from "@/lib/billing/plans";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const body = (await req.json().catch(() => ({}))) as { planCode?: string };
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

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    const stripe = getStripe();
    let customerId = subscription?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.email ?? undefined,
        metadata: {
          tenant_id: ctx.tenantId,
          auth_user_id: ctx.authUserId,
        },
      });
      customerId = customer.id;
    }

    const appUrl = getAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings?billing=success`,
      cancel_url: `${appUrl}/settings?billing=cancelled`,
      client_reference_id: ctx.tenantId,
      metadata: {
        tenant_id: ctx.tenantId,
        plan_id: String(plan.id),
        plan_code: planCode,
      },
      subscription_data: {
        metadata: {
          tenant_id: ctx.tenantId,
          plan_id: String(plan.id),
          plan_code: planCode,
        },
      },
    });

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "stripe.checkout.created",
      message: `Checkout Stripe criado para o plano ${planCode}.`,
      metadata: { checkout_session_id: session.id, plan_code: planCode },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Erro ao criar checkout." }, { status: 500 });
  }
}
