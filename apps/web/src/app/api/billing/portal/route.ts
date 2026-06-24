import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const supabase = getSupabaseAdmin();
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (error || !subscription?.stripe_customer_id) {
      return Response.json({ error: "Cliente Stripe nao encontrado para este tenant." }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id as string,
      return_url: `${getAppUrl()}/settings?billing=portal`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Erro ao criar portal Stripe." }, { status: 500 });
  }
}

