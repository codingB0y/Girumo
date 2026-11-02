import "server-only";

import type Stripe from "stripe";
import { hashToken, precoInstagram } from "@/lib/billing/instagram-addon";
import { bloqueioDaOferta, cotacao, type Bloqueio, type Cotacao, type Precos } from "@/lib/billing/instagram-oferta";
import { getStripe } from "@/lib/billing/stripe";
import type { AddonId } from "@/lib/billing/stripe-webhook";
import { getOpenInviteByHash, type InstagramInvite } from "@/lib/stores/instagram-invites";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Cartao = { id: string; brand: string; last4: string };

export type Contexto = {
  bloqueio: Bloqueio | null;
  /** Veio `?convite=` mas ele não vale para esta loja, venceu, foi revogado ou usado. */
  conviteInvalido: boolean;
  convite: InstagramInvite | null;
  cotacao: Cotacao;
  precos: Precos | null;
};

/**
 * Tudo que a página e as duas rotas de cobrança decidem, lido no servidor. O
 * convite só vale se for desta loja (a busca pelo hash filtra a loja da sessão):
 * convite de outra loja e convite vencido dão a mesma resposta, sem dizer qual.
 */
export async function contextoDaAssinatura(tenantId: string, token: string | null): Promise<Contexto> {
  const supabase = getSupabaseAdmin();
  const [plano, settings, convite] = await Promise.all([
    supabase.from("subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle(),
    getTenantSettings(tenantId),
    token ? getOpenInviteByHash(tenantId, hashToken(token), new Date().toISOString()) : Promise.resolve(null),
  ]);
  if (plano.error) throw new Error(plano.error.message);
  return {
    bloqueio: bloqueioDaOferta({ planoStatus: (plano.data?.status as string | undefined) ?? null, instagramAtivo: settings.instagramEnabled }),
    conviteInvalido: Boolean(token) && !convite,
    convite,
    cotacao: cotacao(convite?.discount_percent ?? 0),
    precos: precoInstagram(),
  };
}

/** Cartão para "Autorizar cobrança": o padrão do customer; senão, o primeiro cartão salvo. */
export async function cartaoSalvo(customerId: string): Promise<Cartao | null> {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
  if (customer.deleted) return null;
  const padrao = customer.invoice_settings?.default_payment_method;
  const pm: Stripe.PaymentMethod | null =
    padrao && typeof padrao === "object" && padrao.card ? padrao : ((await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 1 })).data[0] ?? null);
  return pm?.card ? { id: pm.id, brand: pm.card.brand, last4: pm.card.last4 } : null;
}

/**
 * `viva` inclui `unpaid` (não cria outra assinatura por cima). `semPagamento` é o
 * recorte de `unpaid`: o webhook deixa o add-on desligado nesse estado, então
 * "já assinado, aguarde" nunca se resolve; o lojista precisa regularizar a cobrança.
 */
export type AddonNoStripe = { viva: boolean; faturaPendente: string | null; semPagamento: boolean };

/** Pura: decide a situação do add-on desta loja a partir das assinaturas do customer. */
export function situacaoDoAddon(
  subs: Iterable<Pick<Stripe.Subscription, "status" | "metadata" | "latest_invoice">>,
  tenantId: string,
  addon: AddonId,
): AddonNoStripe {
  let unpaid = false;
  let faturaPendente: string | null = null;
  let achouFatura = false;
  for (const s of subs) {
    if (s.metadata.addon !== addon || s.metadata.tenant_id !== tenantId) continue;
    // `unpaid` não decide sozinha: uma ativa, em qualquer ordem, vence.
    if (s.status === "active" || s.status === "trialing" || s.status === "past_due") return { viva: true, faturaPendente: null, semPagamento: false };
    if (s.status === "unpaid") unpaid = true;
    else if (s.status === "incomplete" && !achouFatura && s.latest_invoice && typeof s.latest_invoice === "object") {
      achouFatura = true;
      faturaPendente = s.latest_invoice.hosted_invoice_url ?? null;
    }
  }
  if (unpaid) return { viva: true, faturaPendente: null, semPagamento: true };
  return { viva: false, faturaPendente, semPagamento: false };
}

/**
 * O que já existe do add-on no Stripe para esta loja, ANTES de criar outro.
 * `instagram_enabled` só muda depois do webhook: sem esta leitura, duas abas (ou
 * uma recusa seguida de "outro cartão") criavam duas assinaturas cobráveis.
 * Viva = não cria; `incomplete` = devolve a fatura aberta dela em vez de criar outra.
 */
export async function addonNoStripe(customerId: string, tenantId: string, addon: AddonId = "instagram"): Promise<AddonNoStripe> {
  const subs: Stripe.Subscription[] = [];
  for await (const s of getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 100, expand: ["data.latest_invoice"] })) subs.push(s);
  return situacaoDoAddon(subs, tenantId, addon);
}

/** O customer da loja, se já existir (a página não cria customer só por abrir). */
export async function customerDaLoja(tenantId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("stripe_customer_id").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.stripe_customer_id as string | null | undefined) ?? null;
}
