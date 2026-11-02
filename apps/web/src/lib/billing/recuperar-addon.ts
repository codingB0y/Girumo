import type Stripe from "stripe";

/**
 * Add-on Recuperar: só mensalidade, em assinatura separada do plano, sem implantação nem
 * convite. Puro (sem `server-only`): o painel importa o valor e roda sob `tsx --test`.
 * O servidor decide tudo; o cliente nunca manda preço. O id do preço vem do ambiente.
 */
export const RECUPERAR_MENSAL_CENTS = 12_700;

/** `trim`: valor colado no terminal pode trazer quebra de linha. Vazio = venda fechada. */
export function precoRecuperar(): string | null {
  return process.env.STRIPE_PRICE_RECUPERAR?.trim() || null;
}

export function metadataRecuperar(tenantId: string): { tenant_id: string; addon: "recuperar" } {
  return { tenant_id: tenantId, addon: "recuperar" };
}

export type BloqueioDoRecuperar = "sem_plano" | "ja_assinado";

/** Só loja com plano ativo ou em teste assina; quem já tem o add-on não assina de novo. */
export function bloqueioDoRecuperar(i: { planoStatus: string | null; recuperarAtivo: boolean }): BloqueioDoRecuperar | null {
  if (i.recuperarAtivo) return "ja_assinado";
  if (i.planoStatus !== "active" && i.planoStatus !== "trialing") return "sem_plano";
  return null;
}

/** Checkout hospedado do Stripe: uma linha mensal, sem cupom. Volta para o módulo. */
export function checkoutRecuperarParams(i: {
  customerId: string;
  precoId: string;
  appUrl: string;
  tenantId: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = metadataRecuperar(i.tenantId);
  return {
    mode: "subscription",
    customer: i.customerId,
    payment_method_types: ["card"],
    line_items: [{ price: i.precoId, quantity: 1 }],
    success_url: `${i.appUrl}/painel/recuperar?assinado=1`,
    cancel_url: `${i.appUrl}/painel/recuperar`,
    client_reference_id: i.tenantId,
    metadata,
    subscription_data: { metadata },
  };
}
