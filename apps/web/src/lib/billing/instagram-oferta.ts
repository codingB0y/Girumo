import type Stripe from "stripe";
import { IMPLANTACAO_CENTS, MENSAL_CENTS, implantacaoComDesconto } from "./instagram-preco";

/**
 * A oferta do add-on Instagram: valores e os parâmetros do Stripe, puros para
 * teste (docs/superpowers/specs/2026-10-07-instagram-assinatura-design.md §3–4).
 * O servidor calcula tudo; o cliente nunca manda preço nem desconto.
 */
export type Precos = { mensal: string; implantacao: string };

export type Cotacao = {
  descontoPercent: number;
  implantacaoCheiaCents: number;
  implantacaoCents: number;
  mensalCents: number;
  totalHojeCents: number;
};

export function cotacao(descontoPercent: number): Cotacao {
  const implantacaoCents = implantacaoComDesconto(descontoPercent);
  return { descontoPercent, implantacaoCheiaCents: IMPLANTACAO_CENTS, implantacaoCents, mensalCents: MENSAL_CENTS, totalHojeCents: implantacaoCents + MENSAL_CENTS };
}

export type Bloqueio = "sem_plano" | "ja_assinado";

/** Só loja com plano ativo ou em teste assina; quem já tem o add-on não assina de novo. */
export function bloqueioDaOferta(i: { planoStatus: string | null; instagramAtivo: boolean }): Bloqueio | null {
  if (i.instagramAtivo) return "ja_assinado";
  if (i.planoStatus !== "active" && i.planoStatus !== "trialing") return "sem_plano";
  return null;
}

export function metadataAddon(tenantId: string, inviteId: string | null): Record<string, string> {
  return inviteId ? { tenant_id: tenantId, addon: "instagram", invite_id: inviteId } : { tenant_id: tenantId, addon: "instagram" };
}

/**
 * Cartão salvo: o Stripe cobra na criação (`allow_incomplete`). Pago = assinatura
 * `active`; banco pedindo confirmação ou recusa = `incomplete`, e a página manda a
 * pessoa para a fatura hospedada do Stripe, que confirma o 3D Secure.
 */
export function subscriptionInstagramParams(i: {
  customerId: string;
  paymentMethodId: string;
  precos: Precos;
  tenantId: string;
  inviteId: string | null;
  cupomId: string | null;
}): Stripe.SubscriptionCreateParams {
  return {
    customer: i.customerId,
    default_payment_method: i.paymentMethodId,
    items: [{ price: i.precos.mensal, quantity: 1 }],
    add_invoice_items: [i.cupomId ? { price: i.precos.implantacao, quantity: 1, discounts: [{ coupon: i.cupomId }] } : { price: i.precos.implantacao, quantity: 1 }],
    payment_behavior: "allow_incomplete",
    metadata: metadataAddon(i.tenantId, i.inviteId),
    expand: ["latest_invoice"],
  };
}

/** Sem cartão salvo (ou "usar outro cartão"): Checkout hospedado, como o do plano. */
export function checkoutInstagramParams(i: {
  customerId: string;
  precos: Precos;
  appUrl: string;
  tenantId: string;
  inviteId: string | null;
  cupomId: string | null;
  /** Caminho de volta ao desistir (a página de assinar, com o convite). */
  voltar: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = metadataAddon(i.tenantId, i.inviteId);
  return {
    mode: "subscription",
    customer: i.customerId,
    payment_method_types: ["card"],
    line_items: [
      { price: i.precos.mensal, quantity: 1 },
      { price: i.precos.implantacao, quantity: 1 },
    ],
    ...(i.cupomId ? { discounts: [{ coupon: i.cupomId }] } : {}),
    success_url: `${i.appUrl}/painel/instagram?assinado=1`,
    cancel_url: `${i.appUrl}${i.voltar}`,
    client_reference_id: i.tenantId,
    metadata,
    subscription_data: { metadata },
  };
}
