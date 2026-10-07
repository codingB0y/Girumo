import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminContext } from "@/lib/admin-guard";
import { CONVITE_VALIDADE_MS, cupomDoConvite, novoTokenConvite, parseDesconto, precoInstagram } from "@/lib/billing/instagram-addon";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { createInvite, listInvites, revokeOpenInvites, type InstagramInvite } from "@/lib/stores/instagram-invites";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Revoga o aberto e apaga o cupom dele no Stripe (cupom já apagado é o caso normal de reenvio). */
async function revogar(tenantId: string): Promise<InstagramInvite[]> {
  const revogados = await revokeOpenInvites(tenantId);
  for (const c of revogados) {
    if (!c.stripe_coupon_id) continue;
    try {
      await getStripe().coupons.del(c.stripe_coupon_id);
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeError && error.statusCode === 404)) throw error;
    }
  }
  return revogados;
}

async function auditar(tenantId: string, adminUserId: string, adminEmail: string, message: string, metadata: Record<string, unknown>) {
  const { error } = await getSupabaseAdmin().from("logs").insert({
    tenant_id: tenantId,
    actor_user_id: adminUserId,
    level: "warn",
    event: "admin.instagram.invite",
    message,
    metadata: { admin_email: adminEmail, ...metadata },
  });
  // O convite já mudou: falhar a resposta faria o admin repetir. Fica no console.
  if (error) console.error("[admin/tenants/instagram-invite] log de auditoria falhou:", error.message);
}

async function lojaExiste(id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// GET — histórico de convites da loja (sem token: ele só sai uma vez, no POST).
export async function GET(_req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
  return NextResponse.json({ invites: await listInvites(id) });
}

// POST { discountPercent } — gera o convite (revoga o aberto antes) e devolve o link uma vez.
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { discountPercent?: unknown } | null;
  const desconto = parseDesconto(body?.discountPercent);
  if (desconto === null) return NextResponse.json({ error: "Desconto: número inteiro de 0 a 100." }, { status: 400 });

  const precos = precoInstagram();
  if (!precos) return NextResponse.json({ error: "Preços do Instagram não configurados (STRIPE_PRICE_INSTAGRAM*)." }, { status: 503 });

  try {
    if (!(await lojaExiste(id))) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
    await revogar(id);

    const inviteId = randomUUID();
    const venceEm = new Date(Date.now() + CONVITE_VALIDADE_MS);
    const { token, hash } = novoTokenConvite();

    let cupomId: string | null = null;
    if (desconto > 0) {
      const preco = await getStripe().prices.retrieve(precos.implantacao);
      const params = cupomDoConvite(desconto, typeof preco.product === "string" ? preco.product : preco.product.id, venceEm, inviteId);
      if (params) cupomId = (await getStripe().coupons.create(params)).id;
    }

    try {
      await createInvite(id, { id: inviteId, tokenHash: hash, discountPercent: desconto, stripeCouponId: cupomId, expiresAt: venceEm.toISOString(), createdBy: admin.authUserId });
    } catch (error) {
      // Sem a linha, o cupom não tem dono: apaga para não sobrar desconto solto.
      if (cupomId) await getStripe().coupons.del(cupomId).catch(() => {});
      throw error;
    }

    await auditar(id, admin.authUserId, admin.email, `Admin ${admin.email} gerou convite do Instagram com ${desconto}% na implementação.`, { invite_id: inviteId, discount_percent: desconto, expires_at: venceEm.toISOString() });

    return NextResponse.json({
      link: `${getAppUrl()}/painel/instagram/assinar?convite=${encodeURIComponent(token)}`,
      expiresAt: venceEm.toISOString(),
      discountPercent: desconto,
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) return NextResponse.json({ error: `Stripe: ${error.message}` }, { status: 502 });
    console.error("[admin/tenants/instagram-invite]", error);
    return NextResponse.json({ error: "Erro ao gerar o convite." }, { status: 500 });
  }
}

// DELETE — revoga o convite aberto.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
  try {
    const revogados = await revogar(id);
    if (revogados.length > 0) await auditar(id, admin.authUserId, admin.email, `Admin ${admin.email} revogou o convite do Instagram.`, { invite_ids: revogados.map((c) => c.id) });
    return NextResponse.json({ revoked: revogados.length });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) return NextResponse.json({ error: `Stripe: ${error.message}` }, { status: 502 });
    console.error("[admin/tenants/instagram-invite]", error);
    return NextResponse.json({ error: "Erro ao revogar o convite." }, { status: 500 });
  }
}
