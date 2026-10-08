import { z } from "zod";
import { addonNoStripe, contextoDaAssinatura } from "@/lib/billing/instagram-contexto";
import { checkoutInstagramParams } from "@/lib/billing/instagram-oferta";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { resolveTenantCustomerId } from "@/lib/billing/tenant-customer";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({ convite: z.string().max(100).optional() });

// POST /api/billing/instagram/checkout { convite? } — Checkout hospedado do Stripe
// (sem cartão salvo, ou "usar outro cartão"). Devolve { url }.
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);
    const parsed = corpoSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });

    const convite = parsed.data.convite || null;
    const c = await contextoDaAssinatura(ctx.tenantId, convite);
    if (c.bloqueio === "sem_plano") return Response.json({ error: "Assine um plano primeiro." }, { status: 409 });
    if (c.bloqueio === "ja_assinado") return Response.json({ error: "O Instagram já está assinado." }, { status: 409 });
    if (c.conviteInvalido) return Response.json({ error: "Este convite não vale mais. Fale com a Girumo." }, { status: 409 });
    if (!c.precos) return Response.json({ error: "Assinatura do Instagram indisponível no momento." }, { status: 503 });

    const supabase = getSupabaseAdmin();
    const stripe = getStripe();
    const customerId = await resolveTenantCustomerId({ supabase, stripe, tenantId: ctx.tenantId, email: ctx.email ?? null, authUserId: ctx.authUserId });
    const existente = await addonNoStripe(customerId, ctx.tenantId);
    if (existente.viva) return Response.json({ error: "O Instagram já está assinado. Pode levar alguns segundos para liberar." }, { status: 409 });
    // Tentativa anterior recusada ou pedindo 3D Secure: a fatura dela aceita outro cartão.
    if (existente.faturaPendente) return Response.json({ url: existente.faturaPendente });
    const voltar = convite ? `/painel/instagram/assinar?convite=${encodeURIComponent(convite)}` : "/painel/instagram/assinar";
    const session = await stripe.checkout.sessions.create(
      checkoutInstagramParams({ customerId, precos: c.precos, appUrl: getAppUrl(), tenantId: ctx.tenantId, inviteId: c.convite?.id ?? null, cupomId: c.convite?.stripe_coupon_id ?? null, voltar }),
    );
    return Response.json({ url: session.url });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[billing/instagram/checkout]", e);
    return Response.json({ error: "Não deu pra abrir o pagamento. Tente de novo." }, { status: 500 });
  }
}
