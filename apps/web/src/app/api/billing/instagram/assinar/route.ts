import Stripe from "stripe";
import { z } from "zod";
import { cartaoSalvo, contextoDaAssinatura } from "@/lib/billing/instagram-contexto";
import { subscriptionInstagramParams } from "@/lib/billing/instagram-oferta";
import { getStripe } from "@/lib/billing/stripe";
import { resolveTenantCustomerId } from "@/lib/billing/tenant-customer";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({ convite: z.string().max(100).optional() });

// POST /api/billing/instagram/assinar { convite? } — "Autorizar cobrança" no cartão
// salvo. É o ÚNICO lugar que cobra sem passar pelo Checkout, e só roda pelo clique.
// Pago: { status: "paid" }. Banco pediu confirmação ou recusou: { redirect } para a
// fatura hospedada do Stripe.
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);
    const parsed = corpoSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });

    const c = await contextoDaAssinatura(ctx.tenantId, parsed.data.convite || null);
    if (c.bloqueio === "sem_plano") return Response.json({ error: "Assine um plano primeiro." }, { status: 409 });
    if (c.bloqueio === "ja_assinado") return Response.json({ error: "O Instagram já está assinado." }, { status: 409 });
    if (c.conviteInvalido) return Response.json({ error: "Este convite não vale mais. Fale com a Girumo." }, { status: 409 });
    if (!c.precos) return Response.json({ error: "Assinatura do Instagram indisponível no momento." }, { status: 503 });

    const supabase = getSupabaseAdmin();
    const stripe = getStripe();
    const customerId = await resolveTenantCustomerId({ supabase, stripe, tenantId: ctx.tenantId, email: ctx.email ?? null, authUserId: ctx.authUserId });
    const cartao = await cartaoSalvo(customerId);
    if (!cartao) return Response.json({ error: "Nenhum cartão salvo. Use outro cartão." }, { status: 409 });

    const sub = await stripe.subscriptions.create(
      subscriptionInstagramParams({ customerId, paymentMethodId: cartao.id, precos: c.precos, tenantId: ctx.tenantId, inviteId: c.convite?.id ?? null, cupomId: c.convite?.stripe_coupon_id ?? null }),
      // Clique duplo ou reenvio no mesmo dia não cria duas assinaturas.
      { idempotencyKey: `ig-assinar:${ctx.tenantId}:${c.convite?.id ?? "sem-convite"}:${new Date().toISOString().slice(0, 10)}` },
    );

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "stripe.addon.instagram.assinar",
      message: `Assinatura do Instagram no cartão final ${cartao.last4}: ${sub.status}.`,
      metadata: { stripe_subscription_id: sub.id, status: sub.status, invite_id: c.convite?.id ?? null },
    });

    if (sub.status === "active") return Response.json({ status: "paid" });
    const fatura = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    if (fatura?.hosted_invoice_url) return Response.json({ redirect: fatura.hosted_invoice_url });
    return Response.json({ error: "O banco não aprovou a cobrança. Tente outro cartão." }, { status: 402 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Stripe.errors.StripeIdempotencyError) return Response.json({ error: "Já existe uma tentativa de hoje. Recarregue a página." }, { status: 409 });
    if (e instanceof Stripe.errors.StripeCardError) return Response.json({ error: "O banco recusou o cartão. Use outro cartão." }, { status: 402 });
    console.error("[billing/instagram/assinar]", e);
    return Response.json({ error: "Não deu pra cobrar agora. Tente de novo." }, { status: 500 });
  }
}
