import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminContext } from "@/lib/admin-guard";
import {
  COURTESY_MAX_MONTHS,
  courtesyCouponParams,
  courtesyCreateParams,
  courtesyDecision,
  courtesyMetadata,
  courtesyResumesAt,
  courtesyUpdateParams,
  parseCourtesyMonths,
} from "@/lib/billing/courtesy";
import { getStripePriceId, normalizePlanCode } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { resolveTenantCustomerId } from "@/lib/billing/tenant-customer";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * N meses grátis num plano, com a cobrança voltando sozinha no fim.
 *
 * Separada de `[id]/plan` (concessão manual, sem Stripe e sem prazo) porque esta
 * mexe na assinatura REAL do cliente: no fim dos meses o cartão dele é cobrado.
 * As regras moram em `lib/billing/courtesy.ts`, que roda sob `tsx --test`.
 *
 * O banco NÃO é escrito aqui: quem grava `subscriptions` é o webhook, a partir
 * do evento que esta chamada gera no Stripe. Gravar dos dois lados abriria a
 * mesma corrida que a guarda de `stripe_event_created_at` existe para fechar.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const { planId, months: rawMonths, reason } = (body ?? {}) as {
    planId?: unknown;
    months?: unknown;
    reason?: unknown;
  };

  const months = parseCourtesyMonths(rawMonths);
  if (!months) {
    return NextResponse.json(
      { error: `Meses grátis: número inteiro de 1 a ${COURTESY_MAX_MONTHS}.` },
      { status: 400 },
    );
  }
  if (!planId || typeof planId !== "string") {
    return NextResponse.json({ error: "Escolha um plano." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  if (!org) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, code, name, stripe_price_id")
    .eq("id", planId)
    .maybeSingle();
  if (planError) return NextResponse.json({ error: planError.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });

  const planCode = normalizePlanCode(plan.code);
  const priceId = (plan.stripe_price_id as string | null) ?? getStripePriceId(planCode);
  if (!priceId) {
    return NextResponse.json(
      { error: `O plano ${plan.name} não tem preço no Stripe — não haveria o que cobrar depois.` },
      { status: 400 },
    );
  }

  const { data: row, error: rowError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("tenant_id", id)
    .maybeSingle();
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });

  try {
    const stripe = getStripe();
    const atual = row?.stripe_subscription_id
      ? await stripe.subscriptions.retrieve(row.stripe_subscription_id as string, {
          expand: ["default_payment_method"],
        })
      : null;

    const decision = courtesyDecision(
      atual
        ? { status: atual.status, cancelScheduled: atual.cancel_at_period_end || atual.cancel_at != null }
        : null,
    );
    if (decision.kind === "refuse") return NextResponse.json({ error: decision.error }, { status: 409 });

    const coupon = courtesyCouponParams(months);
    await ensureCoupon(stripe, coupon);

    const now = new Date();
    const item = atual?.items.data[0];
    const resumesAt = courtesyResumesAt({
      status: decision.kind === "update" ? (atual?.status ?? null) : null,
      currentPeriodEnd: item?.current_period_end ?? null,
      now,
      months,
    });
    const metadata = courtesyMetadata({
      tenantId: id,
      planId: String(plan.id),
      planCode,
      months,
      resumesAt,
      adminEmail: admin.email,
      reason: typeof reason === "string" ? reason : null,
    });

    let last4: string | null;
    let subscriptionId: string;

    if (decision.kind === "update") {
      // Nunca cair no ramo de criação com uma assinatura viva: seriam duas
      // cobrando o mesmo cartão no fim da cortesia.
      if (!atual || !item) throw new Error("Assinatura ativa sem item no Stripe.");
      const updated = await stripe.subscriptions.update(
        atual.id,
        courtesyUpdateParams({
          itemId: item.id,
          currentPriceId: item.price.id,
          priceId,
          couponId: coupon.id,
          trialing: atual.status === "trialing",
          metadata,
        }),
      );
      subscriptionId = updated.id;
      last4 = cardLast4(atual.default_payment_method);
    } else {
      const owner = await ownerOf(supabase, id);
      const customerId = await resolveTenantCustomerId({
        supabase,
        stripe,
        tenantId: id,
        email: owner?.email ?? null,
        authUserId: owner?.authUserId ?? null,
      });
      const cards = await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 1 });
      const card = cards.data[0] ?? null;

      const created = await stripe.subscriptions.create(
        courtesyCreateParams({
          customerId,
          priceId,
          couponId: coupon.id,
          paymentMethodId: card?.id ?? null,
          metadata,
        }),
        // Chave por tenant e dia, sem os parâmetros: o duplo clique devolve a
        // MESMA assinatura, e um segundo pedido diferente antes de o webhook
        // gravar a primeira é recusado pelo Stripe — em vez de virar duas
        // assinaturas cobrando o mesmo cartão no fim da cortesia.
        { idempotencyKey: `cortesia-nova:${id}:${now.toISOString().slice(0, 10)}` },
      );
      subscriptionId = created.id;
      last4 = card?.card?.last4 ?? null;
    }

    const volta = resumesAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

    await supabase.from("logs").insert({
      tenant_id: id,
      actor_user_id: admin.authUserId,
      level: "warn",
      event: "admin.billing.courtesy",
      message: `Admin ${admin.email} deu ${months} ${months === 1 ? "mês" : "meses"} grátis do plano ${plan.name}.`,
      metadata: {
        admin_email: admin.email,
        plan_code: planCode,
        months,
        courtesy_until: resumesAt.toISOString(),
        stripe_subscription_id: subscriptionId,
        criou_assinatura: decision.kind === "create",
      },
    });

    const cobranca = last4
      ? `A cobrança normal volta em ${volta} no cartão final ${last4}.`
      : `A cobrança volta em ${volta}, mas não há cartão salvo: o cliente vai precisar pagar pelo portal.`;

    return NextResponse.json({
      success: true,
      message: `"${org.name}": ${months} ${months === 1 ? "mês grátis" : "meses grátis"} no ${plan.name}. ${cobranca} O painel atualiza em alguns segundos.`,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeIdempotencyError) {
      return NextResponse.json(
        {
          error:
            "Já foi criada uma assinatura de cortesia hoje para este cliente. Recarregue a página em alguns segundos e conceda de novo sobre ela.",
        },
        { status: 409 },
      );
    }
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: `Stripe: ${error.message}` }, { status: 502 });
    }
    console.error("[admin/tenants/courtesy]", error);
    return NextResponse.json({ error: "Erro ao conceder a cortesia." }, { status: 500 });
  }
}

/** Cria o cupom da duração; já existir é o caso normal da segunda cortesia igual. */
async function ensureCoupon(stripe: Stripe, params: Stripe.CouponCreateParams): Promise<void> {
  try {
    await stripe.coupons.create(params);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === "resource_already_exists") return;
    throw error;
  }
}

function cardLast4(pm: string | Stripe.PaymentMethod | null): string | null {
  return pm && typeof pm === "object" ? (pm.card?.last4 ?? null) : null;
}

/** Dono do tenant: e-mail do Customer, caso o tenant ainda não tenha um. */
async function ownerOf(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ email: string | null; authUserId: string } | null> {
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("email")
    .eq("auth_user_id", membership.user_id)
    .maybeSingle();
  if (userError) throw userError;

  return { email: (user?.email as string | null) ?? null, authUserId: membership.user_id as string };
}
