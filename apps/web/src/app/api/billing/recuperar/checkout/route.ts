import { z } from "zod";
import { addonNoStripe } from "@/lib/billing/instagram-contexto";
import { checkoutRecuperarParams } from "@/lib/billing/recuperar-addon";
import { contextoDoRecuperar } from "@/lib/billing/recuperar-contexto";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { resolveTenantCustomerId } from "@/lib/billing/tenant-customer";
import { registrarAviso } from "@/lib/recuperar/aviso";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O corpo é só a confirmação: preço, plano e loja vêm do servidor.
const corpoSchema = z.strictObject({ avisoConfirmado: z.literal(true) });

// POST /api/billing/recuperar/checkout { avisoConfirmado: true } — Checkout hospedado do
// Stripe. Devolve { url }. A confirmação do aviso de privacidade é registrada depois das
// checagens do contexto e antes de qualquer chamada ao Stripe (grava também quando o
// Stripe responde "já assinado" ou devolve a fatura pendente).
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);
    const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Confirme o aviso de privacidade para ativar." }, { status: 400 });

    const c = await contextoDoRecuperar(ctx.tenantId);
    if (c.bloqueio === "sem_plano") return Response.json({ error: "Assine um plano primeiro." }, { status: 409 });
    if (c.bloqueio === "ja_assinado") return Response.json({ error: "O Recuperar já está ativo nesta loja.", code: "ja_assinado" }, { status: 409 });
    if (!c.precoId) return Response.json({ error: "Assinatura do Recuperar indisponível no momento." }, { status: 503 });

    const supabase = getSupabaseAdmin();
    // Sem o registro não há prova de que o lojista foi avisado: não cobra. Fica antes de
    // qualquer chamada ao Stripe, inclusive a que devolve a fatura pendente.
    const aviso = await registrarAviso(supabase, { tenantId: ctx.tenantId, userId: ctx.authUserId, origem: "checkout" });
    if (aviso.error) {
      console.error("[billing/recuperar/checkout] aviso", aviso.error);
      return Response.json({ error: "Não deu pra registrar a confirmação. Tente de novo." }, { status: 500 });
    }

    const stripe = getStripe();
    const customerId = await resolveTenantCustomerId({ supabase, stripe, tenantId: ctx.tenantId, email: ctx.email ?? null, authUserId: ctx.authUserId });
    const existente = await addonNoStripe(customerId, ctx.tenantId, "recuperar");
    // `unpaid`: o webhook deixa o Recuperar desligado, então "já assinado, aguarde"
    // nunca se resolveria. O lojista tem que regularizar a cobrança no portal.
    if (existente.semPagamento) {
      return Response.json(
        { error: "A assinatura do Recuperar está com pagamento em aberto. Regularize em Gerenciar cobrança.", code: "cobranca_pendente" },
        { status: 409 },
      );
    }
    // `code` faz a tela esperar o webhook em vez de mostrar um toast (outra aba já pagou).
    if (existente.viva) {
      return Response.json({ error: "O Recuperar já está assinado. Pode levar alguns segundos para liberar.", code: "ja_assinado" }, { status: 409 });
    }
    // Tentativa anterior recusada ou pedindo 3D Secure: a fatura dela aceita outro cartão.
    if (existente.faturaPendente) return Response.json({ url: existente.faturaPendente });

    const session = await stripe.checkout.sessions.create(
      checkoutRecuperarParams({ customerId, precoId: c.precoId, appUrl: getAppUrl(), tenantId: ctx.tenantId }),
    );
    return Response.json({ url: session.url });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[billing/recuperar/checkout]", e);
    return Response.json({ error: "Não deu pra abrir o pagamento. Tente de novo." }, { status: 500 });
  }
}
