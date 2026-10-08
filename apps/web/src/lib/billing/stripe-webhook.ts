import type Stripe from "stripe";
import type { FunnelEvent } from "@/lib/analytics/funnel-summary";
import type { TrialCancelReason } from "./trial";

export const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export type StoreResult = { error: string | null };

export type SubscriptionRow = {
  tenant_id: string;
  plan_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  stripe_event_created_at: string;
  metadata: Record<string, unknown>;
};

export type LogRow = {
  tenant_id: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  metadata: Record<string, unknown>;
};

export type FunnelInput = {
  tenantId: string;
  userId: string | null;
  event: FunnelEvent;
  metadata: Record<string, unknown>;
  /** Preserva a 1ª ocorrência em vez de atualizar o timestamp (ver funnel-events.ts). */
  onlyFirst?: boolean;
};

/** Reserva do teste da conta. `same` = retry do mesmo evento; `lost` = outra assinatura venceu. */
export type ClaimTrialResult = { outcome: "won" | "same" | "lost"; winnerId: string | null } & StoreResult;

/** Reserva do cartão do teste. `taken` = outra conta já testou com este cartão. */
export type ClaimCardResult = { outcome: "ok" | "taken" } & StoreResult;

export type DefaultCard = { fingerprint: string | null; last4: string | null };

/**
 * Porta do webhook. Existe para que a logica seja testavel: os modulos reais
 * (`@/lib/supabase/server`, `@/lib/billing/stripe`) importam "server-only" e
 * nao carregam sob `tsx --test`.
 */
export interface WebhookStore {
  /** true = este stripe_event_id ja foi processado com sucesso antes. */
  hasProcessedEvent(stripeEventId: string): Promise<{ found: boolean } & StoreResult>;
  /** Marcador de idempotencia. Deve ser a ULTIMA escrita do fluxo. */
  markEventProcessed(input: {
    stripeEventId: string;
    type: string;
    eventCreatedAt: string;
  }): Promise<StoreResult>;
  upsertSubscription(row: SubscriptionRow): Promise<StoreResult>;
  insertLog(row: LogRow): Promise<StoreResult>;
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  trackFunnelEvent(input: FunnelInput): Promise<void>;
  /** Grava `organizations.trial_subscription_id` se ainda estiver vazio. */
  claimTrial(input: { tenantId: string; subscriptionId: string }): Promise<ClaimTrialResult>;
  /** Cartão padrão da assinatura. Lança se o Stripe falhar (vira 5xx e reenvio). */
  defaultCard(subscription: Stripe.Subscription): Promise<DefaultCard>;
  /**
   * Grava `organizations.trial_card_fingerprint`; o índice único decide entre contas.
   * Devolve `ok` também quando o fingerprint já é DESTA conta (retry do mesmo evento).
   */
  claimCardFingerprint(input: { tenantId: string; fingerprint: string }): Promise<ClaimCardResult>;
  /** Grava `metadata.cancel_reason` e cancela a assinatura no Stripe, sem cobrar. */
  cancelTrialSubscription(input: {
    subscription: Stripe.Subscription;
    reason: TrialCancelReason;
  }): Promise<StoreResult>;
  /** E-mail "seu teste grátis termina em 3 dias". */
  sendTrialEndingEmail(subscription: Stripe.Subscription): Promise<StoreResult>;
  /**
   * Estado ATUAL do add-on, lido no Stripe (não do evento, que pode chegar fora de
   * ordem ou reenviado). `live` = alguma assinatura do add-on desta loja ativa;
   * `customerOk` = o customer do evento é o da loja (`organizations.stripe_customer_id`).
   */
  instagramAddonState(input: { tenantId: string; customerId: string }): Promise<{ live: boolean; customerOk: boolean; vivas: number } & StoreResult>;
  /** Liga/desliga `tenant_settings.instagram_enabled`. Desligar também pausa os fluxos e para os atendimentos. */
  setInstagramEnabled(input: { tenantId: string; enabled: boolean }): Promise<StoreResult>;
  /** O convite nominal desta assinatura foi usado (só se ainda aberto e da loja). */
  markInstagramInviteUsed(input: { tenantId: string; inviteId: string; subscriptionId: string }): Promise<StoreResult>;
  /** Cancela as assinaturas do add-on Instagram do customer, se ele não tiver outro plano vivo. */
  cancelAddonSubscriptions(customerId: string): Promise<StoreResult>;
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * `payment_status` de sessao que significa "o dinheiro entrou".
 *
 * Boleto e Pix sao metodos ASSINCRONOS: o `checkout.session.completed` deles
 * chega assim que o cliente termina o fluxo, com `payment_status: "unpaid"` —
 * antes de qualquer pagamento. Quem confirma e o
 * `checkout.session.async_payment_succeeded`, que vem depois (boleto pode levar
 * dias). Tratar os dois como a mesma coisa registra receita que nao existe.
 *
 * `no_payment_required` entra porque e o caso legitimo de valor zero (cupom de
 * 100%): nao ha o que cobrar, e a assinatura vale. O teste gratis com cartao
 * tambem volta `no_payment_required`, mas nunca chega a este gate: assinatura
 * `trialing` vai para `handleTrialStart`, e a ja cancelada no teste
 * (`cancel_reason`) sai antes, em `handleCheckoutSession`.
 */
const PAGAMENTO_CONFIRMADO: ReadonlySet<Stripe.Checkout.Session["payment_status"]> = new Set([
  "paid",
  "no_payment_required",
]);

/**
 * Traduz o status do Stripe para o enum `subscription_status` do banco.
 *
 * O enum tem exatamente seis valores (`free, trialing, active, past_due,
 * canceled, unpaid`), identicos em dev e prod, e NAO inclui `incomplete`. Por
 * isso o mapeamento e explicito em vez de repassar a string do Stripe.
 *
 * `incomplete` e `incomplete_expired` caiam no fallback `past_due` — o que era
 * errado nos dois sentidos. `past_due` significa "estava ativa e uma renovacao
 * falhou"; `incomplete` significa "nunca chegou a ser paga". Sao a mesma coisa
 * para quem le o painel de billing e coisas diferentes para o negocio.
 * `unpaid` e `canceled` sao os vizinhos honestos dentro do enum existente.
 */
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "canceled") return "canceled";
  // Primeira cobranca pendente ou recusada: a assinatura nunca valeu.
  if (status === "incomplete") return "unpaid";
  // Passou da janela do Stripe sem pagar a primeira cobranca: morreu.
  if (status === "incomplete_expired") return "canceled";
  // Status novo do Stripe (ex.: `paused`): `past_due` e o conservador — nao
  // libera nada, e o log de sincronizacao guarda o valor cru em `stripe_status`.
  return "past_due";
}

/** Assinatura do add-on Instagram: separada da do plano, nunca vai para `subscriptions`. */
export const isInstagramAddon = (metadata: Stripe.Metadata | null | undefined): boolean => metadata?.addon === "instagram";

/**
 * O add-on Instagram liga e desliga a loja. A decisão NÃO usa o status do evento:
 * o Stripe não garante ordem, e um `updated` antigo com `active` chegando depois
 * do `deleted` religaria de graça. Lê o estado atual (qualquer add-on da loja
 * ativo ou em teste = ligado; `past_due` conta como desligado só quando não há
 * outro vivo, e quem decide é o store). Reenvio e assinatura duplicada caem no
 * mesmo resultado.
 */
async function handleInstagramAddon(subscription: Stripe.Subscription, store: WebhookStore): Promise<StoreResult> {
  const tenantId = subscription.metadata.tenant_id;
  if (!tenantId) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "warn",
      event: "stripe.addon.missing_metadata",
      message: "Assinatura do add-on Instagram sem tenant_id.",
      metadata: { stripe_subscription_id: subscription.id },
    });
    return { error: null };
  }
  const estado = await store.instagramAddonState({ tenantId, customerId: String(subscription.customer) });
  if (estado.error) return { error: estado.error };
  if (!estado.customerOk) {
    // tenant_id do metadata não bate com o customer da loja: não liga nada em loja alheia.
    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.addon.customer_mismatch",
      message: "Assinatura do add-on Instagram com customer diferente do da loja; ignorada.",
      metadata: { stripe_subscription_id: subscription.id, customer: String(subscription.customer) },
    });
    return { error: null };
  }
  const enabled = estado.live;
  if (estado.vivas > 1) {
    // As rotas de assinar barram a segunda, mas um Checkout aberto numa aba e o
    // cartão salvo pago na outra ainda passam. Fica alto no log para estornar.
    await store.insertLog({
      tenant_id: tenantId,
      level: "error",
      event: "stripe.addon.duplicado",
      message: `Loja com ${estado.vivas} assinaturas do add-on Instagram vivas: cancelar e estornar a extra.`,
      metadata: { stripe_subscription_id: subscription.id, customer: String(subscription.customer) },
    });
  }

  const r = await store.setInstagramEnabled({ tenantId, enabled });
  if (r.error) return r;
  // Pago (não no clique): pagamento recusado não gasta o convite.
  const inviteId = subscription.metadata.invite_id;
  // Id torto viraria erro de uuid no banco e reenvio eterno do Stripe.
  if (inviteId && subscription.status === "active" && /^[0-9a-f-]{36}$/i.test(inviteId)) {
    const usado = await store.markInstagramInviteUsed({ tenantId, inviteId, subscriptionId: subscription.id });
    if (usado.error) return usado;
  }
  await store.insertLog({
    tenant_id: tenantId,
    level: "info",
    event: "stripe.addon.instagram",
    message: enabled ? "Add-on Instagram ativo: Instagram liberado." : "Sem add-on Instagram ativo: Instagram desligado.",
    metadata: { stripe_subscription_id: subscription.id, status: subscription.status },
  });
  return { error: null };
}

async function upsertSubscription(
  subscription: Stripe.Subscription,
  eventCreatedAt: string,
  store: WebhookStore,
): Promise<StoreResult> {
  // A perdedora de dois checkouts de teste simultâneos (ver handleTrialStart). Os
  // eventos dela chegam DEPOIS do cancelamento e sobrescreveriam a linha da
  // vencedora — `subscriptions` tem unique(tenant_id).
  if (subscription.metadata.cancel_reason === "trial_duplicate") {
    await store.insertLog({
      tenant_id: subscription.metadata.tenant_id ?? SYSTEM_TENANT_ID,
      level: "info",
      event: "stripe.trial.duplicado_ignorado",
      message: "Evento de assinatura de teste duplicada ignorado.",
      metadata: { stripe_subscription_id: subscription.id },
    });
    return { error: null };
  }

  const tenantId = subscription.metadata.tenant_id;
  const planId = subscription.metadata.plan_id;
  const item = subscription.items.data[0];

  if (!tenantId || !planId) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "warn",
      event: "stripe.subscription.missing_metadata",
      message: "Assinatura Stripe sem tenant_id ou plan_id.",
      metadata: { stripe_subscription_id: subscription.id },
    });
    // Sem metadata nao ha o que gravar, e reenviar nao conserta: 2xx de proposito.
    return { error: null };
  }

  const upserted = await store.upsertSubscription({
    tenant_id: tenantId,
    plan_id: planId,
    stripe_customer_id: String(subscription.customer),
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price.id ?? null,
    status: mapStripeStatus(subscription.status),
    current_period_start: item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    // "Vai acabar sem cobrar". O portal (API dahlia) pode agendar o fim por
    // `cancel_at` com o booleano em false; as telas leem só esta coluna, e sem o
    // `cancel_at` anunciariam uma cobrança que não vem.
    cancel_at_period_end: subscription.cancel_at_period_end || subscription.cancel_at != null,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    stripe_event_created_at: eventCreatedAt,
    metadata: {
      stripe_status: subscription.status,
      plan_code: subscription.metadata.plan_code ?? null,
      // A tela precisa saber POR QUE foi cancelada (cartão repetido no teste).
      cancel_reason: subscription.metadata.cancel_reason ?? null,
      // Cortesia dada pelo admin (`courtesy.ts`): quando a cobrança volta.
      courtesy_until: subscription.metadata.courtesy_until || null,
    },
  });

  // Este erro era descartado. Era ele que transformava "cliente pagou e a
  // assinatura nao foi gravada" num 200 alegre para o Stripe.
  if (upserted.error) return upserted;

  // "Cancelou o plano, cai o add-on junto." O store só cancela se o customer não
  // tiver outro plano vivo (reentrega de uma assinatura antiga não derruba o add-on).
  if (subscription.status === "canceled") {
    const addon = await store.cancelAddonSubscriptions(String(subscription.customer));
    if (addon.error) return addon;
  }

  await store.insertLog({
    tenant_id: tenantId,
    level: "info",
    event: "stripe.subscription.synced",
    message: "Assinatura Stripe sincronizada.",
    metadata: { stripe_subscription_id: subscription.id, status: subscription.status },
  });

  return { error: null };
}

/**
 * A perdedora de dois checkouts de teste já foi cancelada, mas o upsert do topo
 * deixou a linha de `subscriptions` (unique(tenant_id)) com o snapshot dela, e os
 * eventos seguintes dela são ignorados. Devolve a linha à vencedora.
 *
 * Sem vencedora não há o que consertar: erro em vez de 2xx mudo, para o Stripe
 * reenviar — a guarda de `cancel_reason` torna o reenvio seguro.
 */
async function resyncTrialWinner(winnerId: string | null, store: WebhookStore): Promise<StoreResult> {
  if (!winnerId) return { error: "Teste duplicado cancelado sem vencedora registrada." };
  // `now` e nao o `created` deste evento: e uma leitura fresca do Stripe, e o
  // banco descarta evento mais velho que o ultimo gravado (C.2).
  const vencedora = await store.retrieveSubscription(winnerId);
  return upsertSubscription(vencedora, new Date().toISOString(), store);
}

/**
 * As duas travas do teste, usadas no fim do checkout (`handleTrialStart`) e de
 * novo no aviso de fim de teste (`handleTrialWillEnd`), a segunda chance caso o
 * checkout tenha falhado até o Stripe desistir.
 *
 * 1. Um teste por conta: `claimTrial`. Duas abas podem concluir dois checkouts —
 *    a segunda perde, é cancelada sem cobrança, e a linha de `subscriptions` (que
 *    ela acabou de sobrescrever) volta para a vencedora.
 * 2. Um teste por cartão: `claimCardFingerprint`. Cartão que já testou em outra
 *    conta → cancela SEM cobrar. Cobrar na hora contrariaria a oferta "7 dias
 *    grátis" que o Checkout já mostrou (CDC art. 30 e 35).
 *
 * `cancelled: true` = a assinatura perdeu e foi cancelada; quem chamou para aí.
 */
async function enforceTrialLocks(
  subscription: Stripe.Subscription,
  tenantId: string,
  store: WebhookStore,
): Promise<StoreResult & { cancelled: boolean }> {
  const claim = await store.claimTrial({ tenantId, subscriptionId: subscription.id });
  if (claim.error) return { error: claim.error, cancelled: false };

  if (claim.outcome === "lost") {
    const cancelled = await store.cancelTrialSubscription({ subscription, reason: "trial_duplicate" });
    if (cancelled.error) return { error: cancelled.error, cancelled: false };

    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.trial.duplicado",
      message: "Segundo checkout de teste da mesma conta: cancelado sem cobranca.",
      metadata: { stripe_subscription_id: subscription.id, vencedora: claim.winnerId },
    });

    const resynced = await resyncTrialWinner(claim.winnerId, store);
    return { error: resynced.error, cancelled: true };
  }

  const card = await store.defaultCard(subscription);
  if (!card.fingerprint) {
    // Nao deveria acontecer (o teste exige cartao). Segue sem a trava por cartao
    // em vez de negar um teste legitimo — e deixa o rastro para alguem olhar.
    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.trial.sem_cartao",
      message: "Teste iniciado sem fingerprint de cartao; trava por cartao nao aplicada.",
      metadata: { stripe_subscription_id: subscription.id },
    });
  } else {
    const cardClaim = await store.claimCardFingerprint({ tenantId, fingerprint: card.fingerprint });
    if (cardClaim.error) return { error: cardClaim.error, cancelled: false };

    if (cardClaim.outcome === "taken") {
      const cancelled = await store.cancelTrialSubscription({ subscription, reason: "trial_card_reused" });
      if (cancelled.error) return { error: cancelled.error, cancelled: false };

      await store.insertLog({
        tenant_id: tenantId,
        level: "warn",
        event: "stripe.trial.cartao_repetido",
        message: "Cartao ja usado em teste de outra conta: assinatura de teste cancelada sem cobranca.",
        metadata: { stripe_subscription_id: subscription.id },
      });
      return { error: null, cancelled: true };
    }
  }

  return { error: null, cancelled: false };
}

/**
 * O checkout terminou e a assinatura nasceu em teste: as travas
 * (`enforceTrialLocks`) e, só se ela passar, `trial_started` no funil — nunca
 * `payment_completed`, que sai da primeira fatura paga (`invoice.paid`).
 *
 * Retry ANTES do cancelamento é seguro: as duas reservas reconhecem a própria
 * assinatura. Retry DEPOIS do cancelamento lê a assinatura fresca, já `canceled`,
 * e não entra aqui — e por isso, sem tratamento próprio, cairia no gate de
 * pagamento de `handleCheckoutSession` com `no_payment_required` e viraria
 * `payment_completed` falso. Quem o trata é a guarda de `cancel_reason` lá.
 */
async function handleTrialStart(
  subscription: Stripe.Subscription,
  tenantId: string,
  store: WebhookStore,
): Promise<StoreResult> {
  const locks = await enforceTrialLocks(subscription, tenantId, store);
  if (locks.error || locks.cancelled) return { error: locks.error };

  await store.trackFunnelEvent({
    tenantId,
    userId: subscription.metadata.user_id ?? null,
    event: "trial_started",
    metadata: {
      plan_code: subscription.metadata.plan_code ?? null,
      stripe_subscription_id: subscription.id,
    },
    onlyFirst: true,
  });

  return { error: null };
}

/**
 * Sessao de checkout: sincroniza a assinatura e decide se houve PAGAMENTO.
 *
 * As duas coisas sao separadas de proposito. A assinatura e gravada sempre —
 * saber que existe uma tentativa em aberto tem valor, e o status real dela vem
 * do proprio Stripe. Ja o evento de funil `payment_completed` significa receita
 * reconhecida, e so pode sair quando `payment_status` confirma que o dinheiro
 * entrou.
 *
 * Antes disto, qualquer `checkout.session.completed` disparava
 * `payment_completed`. Como boleto e Pix emitem esse evento ANTES do pagamento,
 * gerar um boleto e nunca paga-lo contava como venda no funil.
 */
async function handleCheckoutSession(
  session: Stripe.Checkout.Session,
  eventCreatedAt: string,
  store: WebhookStore,
  options: { pagamentoFalhou?: boolean } = {},
): Promise<StoreResult> {
  if (!session.subscription) return { error: null };

  const subscription = await store.retrieveSubscription(String(session.subscription));
  // Add-on não é venda de plano: só liga o Instagram.
  if (isInstagramAddon(subscription.metadata)) return handleInstagramAddon(subscription, store);
  const processed = await upsertSubscription(subscription, eventCreatedAt, store);
  if (processed.error) return processed;

  const tenantId = subscription.metadata.tenant_id;
  // Sem tenant nao ha a quem atribuir; `upsertSubscription` ja registrou o aviso.
  if (!tenantId) return { error: null };

  // `no_payment_required` vem tanto do cupom de 100% quanto do teste grátis; o
  // que separa os dois é o status da assinatura.
  if (subscription.status === "trialing") return handleTrialStart(subscription, tenantId, store);

  // Reentrega de um checkout de teste que JÁ cancelamos (ver handleTrialStart): a
  // assinatura volta `canceled` e o `no_payment_required` cairia no gate de
  // pagamento abaixo como venda. Nunca houve cobrança — sai aqui.
  //
  // Fica ABAIXO do ramo `trialing` de propósito: o cancelamento grava
  // `cancel_reason` antes de chamar o Stripe, e se o cancel falhar o reenvio lê a
  // assinatura ainda `trialing` com o motivo já gravado. Ela precisa voltar à
  // trava e ser cancelada; acima daqui, sairia 2xx e seria cobrada no 8º dia.
  if (subscription.metadata.cancel_reason) {
    if (subscription.metadata.cancel_reason !== "trial_duplicate") return { error: null };
    // O upsert do topo ignorou a perdedora; se a 1ª tentativa falhou antes do
    // re-sync, a linha ainda está com o snapshot `trialing` dela.
    //
    // Pressuposto deste `claimTrial` (que ESCREVE se a coluna estiver vazia):
    // nada no código limpa `organizations.trial_subscription_id` — nem
    // cancelamento, nem fim do teste. A vencedora reservou primeiro, então a
    // perdedora sempre recebe `lost`. Se algo passar a limpar a coluna, este
    // reenvio reservaria o teste para uma assinatura cancelada.
    const claim = await store.claimTrial({ tenantId, subscriptionId: subscription.id });
    if (claim.error) return { error: claim.error };
    return resyncTrialWinner(claim.outcome === "lost" ? claim.winnerId : null, store);
  }

  const metadataComum = {
    stripe_subscription_id: subscription.id,
    stripe_session_id: session.id,
    payment_status: session.payment_status,
    plan_code: subscription.metadata.plan_code ?? null,
  };

  if (options.pagamentoFalhou) {
    await store.insertLog({
      tenant_id: tenantId,
      level: "warn",
      event: "stripe.checkout.pagamento_falhou",
      message: "Pagamento assincrono (boleto/Pix) nao foi concluido.",
      metadata: metadataComum,
    });
    return { error: null };
  }

  if (!PAGAMENTO_CONFIRMADO.has(session.payment_status)) {
    // Nao e erro: e o estado normal de boleto/Pix recem-emitido. Vira log para
    // que a espera seja visivel, em vez de a tentativa sumir ate o desfecho.
    await store.insertLog({
      tenant_id: tenantId,
      level: "info",
      event: "stripe.checkout.pagamento_pendente",
      message: `Checkout concluido, aguardando pagamento (${session.payment_status}).`,
      metadata: metadataComum,
    });
    return { error: null };
  }

  await store.trackFunnelEvent({
    tenantId,
    userId: subscription.metadata.user_id ?? null,
    event: "payment_completed",
    metadata: {
      plan_code: subscription.metadata.plan_code,
      stripe_subscription_id: subscription.id,
    },
    // Sem isto o upsert do funil reescreve o marco: quem cancela e reassina pelo
    // Checkout teria a 1ª venda movida para a data da reassinatura. O emit em si
    // fica: cupom de 100% tem `amount_paid` 0 e não passa por `invoice.paid`.
    onlyFirst: true,
  });

  return { error: null };
}

/**
 * Primeira fatura PAGA = venda. Vale para o fim do teste grátis e para qualquer
 * primeira cobrança; `onlyFirst` impede que renovações reescrevam o marco.
 *
 * A fatura de R$ 0 que abre o teste também chega como `invoice.paid` — o valor é
 * o filtro. O tenant vem do metadata da assinatura copiado na fatura
 * (`parent.subscription_details`, API dahlia).
 */
async function handleInvoicePaid(invoice: Stripe.Invoice, store: WebhookStore): Promise<StoreResult> {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return { error: null };

  const meta = invoice.parent?.subscription_details?.metadata ?? null;
  // A fatura do add-on não é a primeira venda do plano.
  if (isInstagramAddon(meta)) return { error: null };
  const tenantId = meta?.tenant_id;
  if (!tenantId) return { error: null };

  await store.trackFunnelEvent({
    tenantId,
    userId: meta?.user_id ?? null,
    event: "payment_completed",
    metadata: {
      plan_code: meta?.plan_code ?? null,
      stripe_invoice_id: invoice.id,
      billing_reason: invoice.billing_reason ?? null,
    },
    onlyFirst: true,
  });

  return { error: null };
}

/**
 * O Stripe avisa 3 dias antes do fim do teste. Mandamos o e-mail com valor, data
 * e como cancelar — exigência das bandeiras para teste com cartão, e o que segura
 * chargeback.
 *
 * Decide pela assinatura FRESCA, como `handleCheckoutSession`: um reenvio chega
 * com o snapshot de dias atrás, e o Stripe também manda este evento quando o
 * teste é encerrado na hora (assinatura já `active`).
 *
 * Antes do e-mail, as travas do teste rodam DE NOVO. Elas só rodavam no
 * `checkout.session.completed`; se ele falhou até o Stripe desistir (~3 dias), a
 * perdedora da conta ou o cartão repetido seguiam vivos, recebiam este aviso e
 * eram cobrados no 8º dia — e o cancelamento do teste nunca cobra. Teste
 * legítimo passa direto: `claimTrial` dá `same` e o cartão dá `ok`. Nada de funil
 * aqui: `trial_started` é do checkout.
 *
 * Falha vira ERRO e o Stripe reenvia. A maioria das falhas acontece antes do
 * envio (Stripe, `plans`, cartão), e engolir deixaria o cliente sem o aviso que
 * os Termos prometem. Quem já recebeu não recebe de novo: o envio leva a chave de
 * idempotência `trial-ending/{subscription.id}` no Resend (spec 4.4).
 */
async function handleTrialWillEnd(
  snapshot: Stripe.Subscription,
  store: WebhookStore,
): Promise<StoreResult> {
  // O add-on não tem teste nem as travas do teste do plano.
  if (isInstagramAddon(snapshot.metadata)) return { error: null };
  const subscription = await store.retrieveSubscription(snapshot.id);
  const tenantId = subscription.metadata.tenant_id;
  if (!tenantId || subscription.status !== "trialing") return { error: null };

  // Motivo já gravado e assinatura ainda em teste: o cancel do Stripe falhou
  // depois de gravar o motivo. Re-emite sem reavaliar as travas.
  const reason = subscription.metadata.cancel_reason;
  if (reason === "trial_duplicate" || reason === "trial_card_reused") {
    return store.cancelTrialSubscription({ subscription, reason });
  }

  const locks = await enforceTrialLocks(subscription, tenantId, store);
  if (locks.error || locks.cancelled) return { error: locks.error };

  // Cancelamento marcado (no fim do teste ou numa data): não vai haver cobrança,
  // e o aviso seria mentira.
  if (subscription.cancel_at_period_end || subscription.cancel_at != null) return { error: null };

  return store.sendTrialEndingEmail(subscription);
}

export async function handleStripeEvent(
  event: Stripe.Event,
  store: WebhookStore,
): Promise<WebhookResult> {
  const eventCreatedAt = new Date(event.created * 1000).toISOString();

  const existing = await store.hasProcessedEvent(event.id);

  // Sem conseguir consultar o marcador nao da para afirmar que e duplicata.
  // Processar as cegas arrisca efeito duplo; 5xx faz o Stripe tentar de novo.
  if (existing.error) {
    return {
      status: 503,
      body: { error: "Nao foi possivel verificar idempotencia.", retry: true },
    };
  }

  if (existing.found) return { status: 200, body: { received: true, duplicate: true } };

  // ORDEM CRITICA: processa PRIMEIRO, marca por ULTIMO.
  // O inverso (marcar antes) fazia com que uma falha no processamento virasse
  // um evento "ja recebido": o reenvio do Stripe batia no branch de duplicata
  // e era descartado, sem nenhum caminho de recuperacao automatico.
  let processed: StoreResult = { error: null };

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    processed = isInstagramAddon(subscription.metadata)
      ? await handleInstagramAddon(subscription, store)
      : await upsertSubscription(subscription, eventCreatedAt, store);
  }

  // `async_payment_succeeded` e a confirmacao tardia de boleto/Pix e chega com
  // `payment_status: "paid"`, entao passa pelo mesmo caminho: o gate la dentro
  // decide se houve pagamento, e nao o tipo do evento.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    processed = await handleCheckoutSession(
      event.data.object as Stripe.Checkout.Session,
      eventCreatedAt,
      store,
    );
  }

  // Boleto vencido ou Pix nao pago. Sem isto, a tentativa morria em silencio e
  // a assinatura ficava parada no ultimo status conhecido.
  if (event.type === "checkout.session.async_payment_failed") {
    processed = await handleCheckoutSession(
      event.data.object as Stripe.Checkout.Session,
      eventCreatedAt,
      store,
      { pagamentoFalhou: true },
    );
  }

  if (event.type === "invoice.paid") {
    processed = await handleInvoicePaid(event.data.object as Stripe.Invoice, store);
  }

  if (event.type === "customer.subscription.trial_will_end") {
    processed = await handleTrialWillEnd(event.data.object as Stripe.Subscription, store);
  }

  if (processed.error) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "error",
      event: "stripe.webhook.failed",
      message: `Falha ao processar webhook Stripe: ${event.type}.`,
      metadata: { stripe_event_id: event.id, type: event.type, error: processed.error },
    });

    // 5xx sem marcador gravado: o Stripe reenvia e o reenvio VAI processar.
    return { status: 500, body: { error: processed.error, retry: true } };
  }

  const marked = await store.markEventProcessed({
    stripeEventId: event.id,
    type: event.type,
    eventCreatedAt,
  });

  // O trabalho critico ja esta commitado. Pedir reenvio aqui nao recupera nada
  // e ainda duplicaria o evento de funil, entao devolve 2xx e registra alto.
  if (marked.error) {
    await store.insertLog({
      tenant_id: SYSTEM_TENANT_ID,
      level: "error",
      event: "stripe.webhook.marker_failed",
      message: "Evento processado, mas o marcador de idempotencia nao foi gravado.",
      metadata: { stripe_event_id: event.id, type: event.type, error: marked.error },
    });
  }

  return { status: 200, body: { received: true } };
}
