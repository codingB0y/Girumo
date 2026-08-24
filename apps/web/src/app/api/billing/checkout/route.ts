import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getStripePriceId, normalizePlanCode } from "@/lib/billing/plans";
import { resolveCheckoutCustomerId } from "@/lib/billing/checkout-customer";
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

    const stripe = getStripe();

    const customerId = await resolveCheckoutCustomerId({
      tenantId: ctx.tenantId,
      email: ctx.email ?? null,
      readTenantCustomerId: async () => {
        const { data, error } = await supabase
          .from("organizations")
          .select("stripe_customer_id")
          .eq("id", ctx.tenantId)
          .eq("tenant_id", ctx.tenantId)
          .maybeSingle();
        // Engolir erro aqui traz o bug de volta invisivel: leitura que falha
        // vira customer novo a cada tentativa, que e exatamente o que este
        // caminho existe para evitar.
        if (error) throw error;
        return (data?.stripe_customer_id as string | null) ?? null;
      },
      readSubscriptionCustomerId: async () => {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("stripe_customer_id")
          .eq("tenant_id", ctx.tenantId)
          .maybeSingle();
        if (error) throw error;
        return (data?.stripe_customer_id as string | null) ?? null;
      },
      createCustomer: async ({ idempotencyKey }) => {
        const customer = await stripe.customers.create(
          {
            email: ctx.email ?? undefined,
            metadata: {
              tenant_id: ctx.tenantId,
              auth_user_id: ctx.authUserId,
            },
          },
          { idempotencyKey },
        );
        return customer.id;
      },
      claimCustomerId: async (candidate) => {
        // Grava so enquanto o ponteiro estiver vazio: se duas abas abrirem o
        // checkout juntas, quem perde a corrida segue com o customer do vencedor
        // em vez de apontar para um que ninguem mais referencia.
        const { data: claimed, error: claimError } = await supabase
          .from("organizations")
          .update({ stripe_customer_id: candidate })
          .eq("id", ctx.tenantId)
          .eq("tenant_id", ctx.tenantId)
          .is("stripe_customer_id", null)
          .select("stripe_customer_id")
          .maybeSingle();

        // Nao ter casado linha e o caso normal da corrida e vem sem erro. Erro
        // aqui e outra coisa — violacao do indice unico, por exemplo — e nao
        // pode virar checkout silenciosamente apontado para o customer errado.
        if (claimError) throw claimError;
        if (claimed?.stripe_customer_id) return claimed.stripe_customer_id as string;

        const { data: winner } = await supabase
          .from("organizations")
          .select("stripe_customer_id")
          .eq("id", ctx.tenantId)
          .eq("tenant_id", ctx.tenantId)
          .maybeSingle();

        return (winner?.stripe_customer_id as string | null) ?? candidate;
      },
    });

    const appUrl = getAppUrl();
    // Sem idempotencyKey de proposito: uma chave estavel por tenant+plano
    // devolveria a MESMA sessao dentro das 24h em que o Stripe guarda a chave,
    // e quem ja tivesse pago cairia de volta numa sessao concluida. Sessao
    // sobrando expira sozinha; customer sobrando fica para sempre — por isso a
    // chave esta so na criacao do Customer.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/painel/configuracoes?billing=success`,
      cancel_url: `${appUrl}/painel/configuracoes?billing=cancelled`,
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
