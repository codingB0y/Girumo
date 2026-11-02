import { customerDaLoja } from "@/lib/billing/instagram-contexto";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O customer mora em `organizations` (é onde o checkout do plano e dos add-ons
 * grava). `subscriptions` só tem a cópia do webhook do plano: loja com plano
 * concedido à mão que assinou um add-on não tem linha útil ali, e sem este
 * ponteiro não conseguia pagar fatura em aberto nem cancelar o add-on.
 */
async function customerDoPortal(tenantId: string): Promise<string | null> {
  const doTenant = await customerDaLoja(tenantId);
  if (doTenant) return doTenant;

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.stripe_customer_id as string | null | undefined) ?? null;
}

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const customer = await customerDoPortal(ctx.tenantId);
    if (!customer) {
      return Response.json({ error: "Cliente Stripe nao encontrado para este tenant." }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer,
      return_url: `${getAppUrl()}/painel/configuracoes?billing=portal`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Erro ao criar portal Stripe." }, { status: 500 });
  }
}
