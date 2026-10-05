import { strict as assert } from "node:assert";
import { test } from "node:test";
import type Stripe from "stripe";
import {
  handleStripeEvent,
  mapStripeStatus,
  type FunnelInput,
  type LogRow,
  type StoreResult,
  type SubscriptionRow,
  type WebhookStore,
} from "./stripe-webhook";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PLAN = "22222222-2222-2222-2222-222222222222";

function makeSubscription(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH" },
    items: {
      data: [
        {
          price: { id: "price_123" },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_000_000,
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

function makeEvent(over: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_123",
    type: "customer.subscription.created",
    created: 1_700_000_000,
    data: { object: makeSubscription() },
    ...over,
  } as unknown as Stripe.Event;
}

type FakeOptions = {
  upsertError?: string | null;
  /** Assinatura que o Stripe devolve no `retrieveSubscription`. */
  subscription?: Stripe.Subscription;
  /** Assinaturas por id — para quando o handler busca OUTRA (a vencedora do teste). */
  subscriptionsById?: Record<string, Stripe.Subscription>;
  /** Quem já reservou o teste desta conta (`organizations.trial_subscription_id`). */
  trialHolder?: string | null;
  /** Fingerprints já reservados por OUTRAS contas. */
  takenFingerprints?: string[];
  card?: { fingerprint: string | null; last4: string | null };
  emailError?: string | null;
  /** Falha do banco ao reservar o teste. */
  claimError?: string | null;
  /** Falha do Stripe ao cancelar a assinatura de teste. */
  cancelError?: string | null;
};

/**
 * Fake que modela o que importa para estes testes: o marcador de idempotencia,
 * o estado da assinatura e as reservas do teste grátis, com falha injetavel.
 */
function makeStore(options: FakeOptions = {}) {
  const processedEvents = new Set<string>();
  const upserts: SubscriptionRow[] = [];
  const logs: LogRow[] = [];
  const funnelEvents: FunnelInput[] = [];
  const cancels: { id: string; reason: string }[] = [];
  const emails: string[] = [];
  let upsertError = options.upsertError ?? null;
  let trialHolder = options.trialHolder ?? null;

  const store: WebhookStore = {
    async hasProcessedEvent(id) {
      return { found: processedEvents.has(id), error: null };
    },
    async markEventProcessed({ stripeEventId }) {
      processedEvents.add(stripeEventId);
      return { error: null };
    },
    async upsertSubscription(row): Promise<StoreResult> {
      if (upsertError) return { error: upsertError };
      upserts.push(row);
      return { error: null };
    },
    async insertLog(row) {
      logs.push(row);
      return { error: null };
    },
    async retrieveSubscription(id) {
      return options.subscriptionsById?.[id] ?? options.subscription ?? makeSubscription();
    },
    async trackFunnelEvent(input) {
      funnelEvents.push(input);
    },
    async claimTrial({ subscriptionId }) {
      // `won` junto do erro: se o handler ignorasse o erro, seguiria como teste novo.
      if (options.claimError) return { outcome: "won", winnerId: null, error: options.claimError };
      if (!trialHolder) {
        trialHolder = subscriptionId;
        return { outcome: "won", winnerId: subscriptionId, error: null };
      }
      return {
        outcome: trialHolder === subscriptionId ? "same" : "lost",
        winnerId: trialHolder,
        error: null,
      };
    },
    async defaultCard() {
      return options.card ?? { fingerprint: "fp_cartao_a", last4: "4242" };
    },
    async claimCardFingerprint({ fingerprint }) {
      const taken = (options.takenFingerprints ?? []).includes(fingerprint);
      return { outcome: taken ? "taken" : "ok", error: null };
    },
    async cancelTrialSubscription({ subscription, reason }) {
      if (options.cancelError) return { error: options.cancelError };
      cancels.push({ id: subscription.id, reason });
      return { error: null };
    },
    async sendTrialEndingEmail(subscription) {
      emails.push(subscription.id);
      return { error: options.emailError ?? null };
    },
  };

  return {
    store,
    upserts,
    logs,
    funnelEvents,
    cancels,
    emails,
    processedEvents,
    recuperaBanco: () => {
      upsertError = null;
    },
  };
}

/**
 * Evento de checkout. `payment_status` e o parametro que importa aqui: e ele
 * que separa "cliente pagou" de "cliente gerou um boleto".
 */
function makeCheckoutEvent(
  paymentStatus: Stripe.Checkout.Session["payment_status"],
  over: Partial<Stripe.Event> = {},
): Stripe.Event {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    created: 1_700_000_000,
    data: {
      object: {
        id: "cs_123",
        subscription: "sub_123",
        payment_status: paymentStatus,
      },
    },
    ...over,
  } as unknown as Stripe.Event;
}

test("grava a assinatura quando o evento e valido", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(makeEvent(), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.upserts.length, 1);
  assert.equal(f.upserts[0].tenant_id, TENANT);
  assert.equal(f.upserts[0].status, "active");
});

test("descarta reentrega de um evento que JA foi processado com sucesso", async () => {
  const f = makeStore();

  await handleStripeEvent(makeEvent(), f.store);
  const res = await handleStripeEvent(makeEvent(), f.store);

  assert.equal(res.body.duplicate, true);
  assert.equal(f.upserts.length, 1, "nao pode gravar duas vezes o mesmo evento");
});

test("MUTANTE C.1: falha no upsert devolve 5xx para o Stripe reenviar", async () => {
  const f = makeStore({ upsertError: "23505 duplicate key" });

  const res = await handleStripeEvent(makeEvent(), f.store);

  assert.ok(
    res.status >= 500,
    `o Stripe so reenvia em nao-2xx; devolver ${res.status} faz a assinatura ` +
      "ser perdida em silencio apos o cliente pagar",
  );
});

test("MUTANTE C.1: reenvio DEPOIS de uma falha grava, em vez de virar duplicata", async () => {
  const f = makeStore({ upsertError: "23505 duplicate key" });

  // 1a entrega: o banco falha. O Stripe vai reenviar.
  await handleStripeEvent(makeEvent(), f.store).catch(() => {});
  assert.equal(f.upserts.length, 0, "nada foi gravado na primeira tentativa");

  // O problema passou; o Stripe reentrega o MESMO evento.
  f.recuperaBanco();
  await handleStripeEvent(makeEvent(), f.store);

  assert.equal(
    f.upserts.length,
    1,
    "o reenvio precisa gravar. Se o marcador de idempotencia foi escrito antes " +
      "do processamento, o reenvio e tratado como duplicata e o pagamento e " +
      "perdido para sempre, sem caminho de recuperacao",
  );
});

test("MUTANTE C.2: evento fora de ordem carrega o timestamp para o banco decidir", async () => {
  const f = makeStore();

  const deleted = makeEvent({
    id: "evt_novo",
    type: "customer.subscription.deleted",
    created: 1_700_000_500,
    data: { object: makeSubscription({ status: "canceled" }) },
  } as Partial<Stripe.Event>);

  await handleStripeEvent(deleted, f.store);

  assert.equal(
    f.upserts[0].stripe_event_created_at,
    new Date(1_700_000_500 * 1000).toISOString(),
    "sem o timestamp do evento o banco nao tem como descartar um `updated` " +
      "antigo que chegue depois de um `deleted` e reative assinatura cancelada",
  );
});

test("cancelamento agendado por cancel_at grava cancel_at_period_end: a tela nao promete cobranca", async () => {
  // O portal (API dahlia) pode agendar o fim por `cancel_at` com o booleano em
  // false. As telas leem só `subscriptions.cancel_at_period_end`.
  const f = makeStore();
  const sub = makeSubscription({ status: "trialing", cancel_at_period_end: false, cancel_at: 1_702_000_000 });

  await handleStripeEvent(
    makeEvent({ type: "customer.subscription.updated", data: { object: sub } } as unknown as Partial<Stripe.Event>),
    f.store,
  );

  assert.equal(f.upserts[0].cancel_at_period_end, true);
});

test("cortesia do admin: a data em que a cobranca volta chega na linha", async () => {
  const f = makeStore();
  const sub = makeSubscription({
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", courtesy_until: "2027-01-20T00:00:00.000Z" },
  });

  await handleStripeEvent(
    makeEvent({ type: "customer.subscription.updated", data: { object: sub } } as unknown as Partial<Stripe.Event>),
    f.store,
  );

  assert.equal(f.upserts[0].metadata.courtesy_until, "2027-01-20T00:00:00.000Z");
  // Sem cortesia, a chave vem nula: o "" que apaga a chave no Stripe não pode virar data.
  const semCortesia = makeStore();
  await handleStripeEvent(makeEvent({ id: "evt_2" }), semCortesia.store);
  assert.equal(semCortesia.upserts[0].metadata.courtesy_until, null);
});

test("assinatura sem tenant_id nao grava e registra aviso", async () => {
  const f = makeStore();
  const semMetadata = makeEvent({
    data: { object: makeSubscription({ metadata: {} }) },
  } as Partial<Stripe.Event>);

  await handleStripeEvent(semMetadata, f.store);

  assert.equal(f.upserts.length, 0);
  assert.ok(f.logs.some((l) => l.event === "stripe.subscription.missing_metadata"));
});

// ---------------------------------------------------------------------------
// C.3 — pagamento assincrono (boleto / Pix)
//
// Boleto e Pix emitem `checkout.session.completed` assim que o cliente termina
// o fluxo, com `payment_status: "unpaid"` — dias antes de o dinheiro entrar (ou
// nunca, se o boleto vencer). Antes destes testes, qualquer sessao concluida
// registrava `payment_completed` no funil.
// ---------------------------------------------------------------------------

test("MUTANTE C.3: boleto emitido e NAO pago nao conta como venda", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(makeCheckoutEvent("unpaid"), f.store);

  assert.equal(res.status, 200, "o Stripe nao deve reenviar: nao houve erro nenhum");
  assert.deepEqual(
    f.funnelEvents,
    [],
    "payment_completed com boleto em aberto e receita que nao existe",
  );

  // A assinatura E gravada: saber que ha uma tentativa em aberto tem valor.
  assert.equal(f.upserts.length, 1, "a tentativa precisa ficar registrada");

  const pendente = f.logs.find((l) => l.event === "stripe.checkout.pagamento_pendente");
  assert.ok(pendente, "a espera pelo pagamento tem que ficar visivel, nao sumir");
  assert.equal(pendente?.metadata.payment_status, "unpaid");
});

test("pagamento a vista (cartao) continua contando como venda", async () => {
  const f = makeStore();

  await handleStripeEvent(makeCheckoutEvent("paid"), f.store);

  assert.equal(f.funnelEvents.length, 1, "cartao aprovado e venda");
  assert.equal(f.funnelEvents[0].event, "payment_completed");
  assert.equal(f.funnelEvents[0].tenantId, TENANT);
  assert.equal(
    f.funnelEvents[0].onlyFirst,
    true,
    "sem onlyFirst o upsert do funil reescreve o marco: quem cancela e reassina pelo Checkout " +
      "teria a 1a venda movida para a data da reassinatura",
  );
});

test("valor zero (cupom de 100%) conta como venda sem cobranca", async () => {
  const f = makeStore();

  await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(
    f.funnelEvents.length,
    1,
    "no_payment_required e o caso legitimo de nao haver o que cobrar",
  );
});

test("MUTANTE C.3: boleto pago DEPOIS conta a venda, no evento assincrono", async () => {
  const f = makeStore();

  // 1) cliente gera o boleto: nada de venda.
  // `equal(length, 0)` e nao `deepEqual(lista, [])`: o segundo estreita o tipo
  // da lista para `never[]`, e ai o acesso la embaixo nao compila.
  await handleStripeEvent(makeCheckoutEvent("unpaid"), f.store);
  assert.equal(f.funnelEvents.length, 0);

  // 2) dias depois o boleto e compensado
  const pago = makeCheckoutEvent("paid", {
    id: "evt_checkout_2",
    type: "checkout.session.async_payment_succeeded",
  });
  await handleStripeEvent(pago, f.store);

  assert.equal(
    f.funnelEvents.length,
    1,
    "sem handler de async_payment_succeeded a venda real nunca era registrada",
  );
  assert.equal(f.funnelEvents[0].event, "payment_completed");
});

test("boleto vencido registra a falha em vez de morrer em silencio", async () => {
  const f = makeStore();

  const falhou = makeCheckoutEvent("unpaid", {
    id: "evt_checkout_3",
    type: "checkout.session.async_payment_failed",
  });
  const res = await handleStripeEvent(falhou, f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.funnelEvents, []);

  const log = f.logs.find((l) => l.event === "stripe.checkout.pagamento_falhou");
  assert.ok(log, "boleto vencido tem que deixar rastro");
  assert.equal(log?.level, "warn");
});

test("MUTANTE C.3: incomplete nao vira past_due", () => {
  // O enum `subscription_status` do banco nao tem `incomplete` (identico em dev
  // e prod), entao o mapeamento precisa escolher um vizinho. `past_due` era a
  // escolha errada: significa "estava ativa e a renovacao falhou", nao "nunca
  // foi paga".
  assert.equal(mapStripeStatus("incomplete"), "unpaid");
  assert.equal(mapStripeStatus("incomplete_expired"), "canceled");

  // O que ja funcionava nao pode ter mudado junto.
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("canceled"), "canceled");
});

// ---------------------------------------------------------------------------
// Teste grátis de 7 dias (spec 2026-10-03). O checkout de teste volta com
// `payment_status: no_payment_required` — o mesmo do cupom de 100% —, e é o
// status da ASSINATURA (`trialing`) que separa os dois.
// ---------------------------------------------------------------------------

function trialing(id: string, metadata: Record<string, string> = {}): Stripe.Subscription {
  return makeSubscription({
    id,
    status: "trialing",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", ...metadata },
  });
}

test("teste novo: reserva, conta trial_started e NAO conta venda", async () => {
  const f = makeStore({ subscription: trialing("sub_trial") });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.funnelEvents.map((e) => e.event), ["trial_started"]);
  assert.equal(f.funnelEvents[0].onlyFirst, true);
  assert.equal(f.cancels.length, 0);
  assert.deepEqual(f.upserts.map((u) => u.stripe_subscription_id), ["sub_trial"]);
});

test("teste ja reservado por esta mesma assinatura (retry) segue sem cancelar", async () => {
  const f = makeStore({ subscription: trialing("sub_trial"), trialHolder: "sub_trial" });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.cancels.length, 0);
  assert.deepEqual(f.funnelEvents.map((e) => e.event), ["trial_started"]);
});

test("cartao usado em teste de outra conta: cancela sem cobrar e nao conta teste", async () => {
  const f = makeStore({
    subscription: trialing("sub_trial"),
    card: { fingerprint: "fp_repetido", last4: "4242" },
    takenFingerprints: ["fp_repetido"],
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_trial", reason: "trial_card_reused" }]);
  assert.equal(f.funnelEvents.length, 0);
  assert.ok(f.logs.some((l) => l.event === "stripe.trial.cartao_repetido"));
});

test("segundo checkout de teste da mesma conta: cancela o perdedor e devolve a linha a vencedora", async () => {
  const vencedora = trialing("sub_win");
  const f = makeStore({
    subscription: trialing("sub_dup"),
    trialHolder: "sub_win",
    subscriptionsById: { sub_win: vencedora },
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_dup", reason: "trial_duplicate" }]);
  // A perdedora sobrescreve a linha primeiro (upsert do topo); a vencedora volta por último.
  assert.deepEqual(f.upserts.map((u) => u.stripe_subscription_id), ["sub_dup", "sub_win"]);
  assert.equal(f.funnelEvents.length, 0);
});

// Reentrega DEPOIS de um cancelamento bem-sucedido (a 1ª tentativa cancelou e
// falhou adiante, ou deu timeout). O Stripe devolve a assinatura já `canceled`,
// o ramo `trialing` não pega, e o `no_payment_required` do checkout de teste
// caía no caminho de pagamento — `payment_completed` falso.

function canceladaNoTeste(id: string, reason: string): Stripe.Subscription {
  return makeSubscription({
    id,
    status: "canceled",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", cancel_reason: reason },
  });
}

test("reentrega apos cancelar por cartao repetido nao conta venda", async () => {
  const f = makeStore({
    subscription: canceladaNoTeste("sub_trial", "trial_card_reused"),
    trialHolder: "sub_trial",
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.funnelEvents, [], "assinatura cancelada sem cobranca nao e venda");
  assert.equal(f.cancels.length, 0, "ja estava cancelada");
  assert.deepEqual(f.upserts.map((u) => u.status), ["canceled"]);
});

test("reentrega apos cancelar o teste duplicado nao conta venda e devolve a linha a vencedora", async () => {
  const f = makeStore({
    subscription: canceladaNoTeste("sub_dup", "trial_duplicate"),
    trialHolder: "sub_win",
    subscriptionsById: { sub_win: trialing("sub_win") },
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.funnelEvents, [], "assinatura cancelada sem cobranca nao e venda");
  assert.equal(f.cancels.length, 0, "ja estava cancelada");
  // A 1ª tentativa deixou a linha com o snapshot `trialing` da perdedora, e os
  // eventos dela são ignorados: sem o re-sync aqui, ninguém conserta a linha.
  assert.deepEqual(f.upserts.map((u) => u.stripe_subscription_id), ["sub_win"]);
});

// O cancelamento real grava `metadata.cancel_reason` ANTES de chamar o cancel do
// Stripe. Se o cancel falha, o evento volta 500 e o reenvio lê a assinatura AINDA
// `trialing`, já com o motivo gravado. Ela tem que passar de novo pela trava e ser
// cancelada — senão é cobrada no 8º dia (no duplicado, cobrança em dobro). É o que
// prende a guarda de `cancel_reason` ABAIXO do ramo `trialing`.

test("reenvio com cartao repetido marcado mas assinatura ainda em teste re-tenta o cancelamento", async () => {
  const f = makeStore({
    subscription: trialing("sub_trial", { cancel_reason: "trial_card_reused" }),
    trialHolder: "sub_trial",
    takenFingerprints: ["fp_cartao_a"],
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_trial", reason: "trial_card_reused" }]);
  assert.deepEqual(f.funnelEvents, []);
});

test("reenvio com duplicado marcado mas assinatura ainda em teste re-tenta o cancelamento", async () => {
  const f = makeStore({
    subscription: trialing("sub_dup", { cancel_reason: "trial_duplicate" }),
    trialHolder: "sub_win",
    subscriptionsById: { sub_win: trialing("sub_win") },
  });

  const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_dup", reason: "trial_duplicate" }]);
  assert.deepEqual(f.upserts.map((u) => u.stripe_subscription_id), ["sub_win"]);
  assert.deepEqual(f.funnelEvents, []);
});

test("erro do store ao reservar o teste ou ao cancelar devolve 5xx sem gravar o marcador", async () => {
  const cenarios: { nome: string; opts: FakeOptions }[] = [
    { nome: "claimTrial", opts: { claimError: "db fora" } },
    { nome: "cancelTrialSubscription", opts: { cancelError: "stripe 500", takenFingerprints: ["fp_cartao_a"] } },
  ];

  for (const { nome, opts } of cenarios) {
    const f = makeStore({ subscription: trialing("sub_trial"), ...opts });

    const res = await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

    assert.ok(res.status >= 500, `${nome}: o Stripe so reenvia em nao-2xx; veio ${res.status}`);
    assert.equal(f.processedEvents.size, 0, `${nome}: marcador gravado bloquearia o reenvio`);
    assert.deepEqual(f.funnelEvents, [], `${nome}`);
  }
});

test("teste sem fingerprint de cartao segue, mas deixa rastro", async () => {
  const f = makeStore({
    subscription: trialing("sub_trial"),
    card: { fingerprint: null, last4: null },
  });

  await handleStripeEvent(makeCheckoutEvent("no_payment_required"), f.store);

  assert.ok(f.logs.some((l) => l.event === "stripe.trial.sem_cartao"));
  assert.deepEqual(f.funnelEvents.map((e) => e.event), ["trial_started"]);
});

test("eventos da assinatura duplicada nao sobrescrevem a linha", async () => {
  const f = makeStore();
  const dup = makeSubscription({
    id: "sub_dup",
    status: "canceled",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", cancel_reason: "trial_duplicate" },
  });

  const res = await handleStripeEvent(
    makeEvent({ type: "customer.subscription.deleted", data: { object: dup } } as unknown as Partial<Stripe.Event>),
    f.store,
  );

  assert.equal(res.status, 200);
  assert.equal(f.upserts.length, 0);
});

test("motivo do cancelamento chega na linha de subscriptions", async () => {
  const f = makeStore();
  const sub = makeSubscription({
    status: "canceled",
    metadata: { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH", cancel_reason: "trial_card_reused" },
  });

  await handleStripeEvent(
    makeEvent({ type: "customer.subscription.deleted", data: { object: sub } } as unknown as Partial<Stripe.Event>),
    f.store,
  );

  assert.equal(f.upserts[0].metadata.cancel_reason, "trial_card_reused");
});

// ---------------------------------------------------------------------------
// Primeira fatura paga (a venda real do teste grátis) e aviso de fim de teste.
// ---------------------------------------------------------------------------

function invoiceEvent(
  amountPaid: number,
  meta: Record<string, string> | null = { tenant_id: TENANT, plan_code: "GROWTH" },
): Stripe.Event {
  return {
    id: `evt_inv_${amountPaid}`,
    type: "invoice.paid",
    created: 1_700_000_000,
    data: {
      object: {
        id: "in_1",
        amount_paid: amountPaid,
        billing_reason: "subscription_cycle",
        parent: meta ? { subscription_details: { subscription: "sub_trial", metadata: meta } } : null,
      },
    },
  } as unknown as Stripe.Event;
}

test("primeira fatura paga (fim do teste) conta a venda e pede onlyFirst", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(invoiceEvent(29700), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.funnelEvents.length, 1);
  assert.equal(f.funnelEvents[0].event, "payment_completed");
  assert.equal(f.funnelEvents[0].onlyFirst, true);
});

test("fatura de R$ 0 (a que abre o teste) nao e venda", async () => {
  const f = makeStore();

  await handleStripeEvent(invoiceEvent(0), f.store);

  assert.equal(f.funnelEvents.length, 0);
});

test("fatura sem assinatura (sem tenant) e ignorada sem erro", async () => {
  const f = makeStore();

  const res = await handleStripeEvent(invoiceEvent(29700, null), f.store);

  assert.equal(res.status, 200);
  assert.equal(f.funnelEvents.length, 0);
});

function trialWillEnd(over: Partial<Stripe.Subscription> = {}): Stripe.Event {
  return makeEvent({
    id: "evt_twe",
    type: "customer.subscription.trial_will_end",
    data: { object: makeSubscription({ status: "trialing", ...over }) },
  } as unknown as Partial<Stripe.Event>);
}

/**
 * Store cuja assinatura FRESCA (`retrieveSubscription("sub_123")`) é `fresca`.
 * O handler decide por ela, não pelo snapshot do evento — um reenvio chega velho.
 */
function storeComFresca(fresca: Partial<Stripe.Subscription>, options: FakeOptions = {}) {
  return makeStore({
    ...options,
    subscriptionsById: { ...options.subscriptionsById, sub_123: makeSubscription(fresca) },
  });
}

test("aviso de fim de teste manda o e-mail", async () => {
  const f = storeComFresca({ status: "trialing" });

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.emails, ["sub_123"]);
});

test("teste ja cancelado pelo cliente nao recebe aviso de cobranca", async () => {
  const f = storeComFresca({ status: "trialing", cancel_at_period_end: true });

  await handleStripeEvent(trialWillEnd({ cancel_at_period_end: true }), f.store);

  assert.deepEqual(f.emails, []);
});

test("teste encerrado na hora (assinatura fresca ja active) nao recebe aviso", async () => {
  // O Stripe manda trial_will_end tambem quando o teste e encerrado agora.
  const f = storeComFresca({ status: "active" });

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.emails, []);
});

test("snapshot velho sem cancelamento, mas a assinatura fresca ja cancela no fim: sem aviso", async () => {
  const f = storeComFresca({ status: "trialing", cancel_at_period_end: true });

  await handleStripeEvent(trialWillEnd({ cancel_at_period_end: false }), f.store);

  assert.deepEqual(f.emails, [], "reenvio carrega o estado de dias atras; vale o do Stripe agora");
});

test("assinatura fresca com cancel_at marcado nao recebe aviso de cobranca", async () => {
  const f = storeComFresca({ status: "trialing", cancel_at: 1_700_500_000 });

  await handleStripeEvent(trialWillEnd(), f.store);

  assert.deepEqual(f.emails, []);
});

test("falha no aviso devolve 5xx sem marcador: o Stripe reenvia e a chave do Resend segura o duplicado", async () => {
  const f = storeComFresca({ status: "trialing" }, { emailError: "resend fora" });

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.ok(res.status >= 500, `engolir a falha perde o aviso que os Termos prometem; veio ${res.status}`);
  assert.equal(f.processedEvents.has("evt_twe"), false, "marcador gravado bloquearia o reenvio");
  assert.ok(f.logs.some((l) => l.event === "stripe.webhook.failed" && l.metadata.error === "resend fora"));
});

// ---------------------------------------------------------------------------
// trial_will_end como segunda chance das travas do teste. Se o
// checkout.session.completed falhou até o Stripe desistir (~3 dias), a perdedora
// ou o cartão repetido seguem vivos: sem isto, recebiam "termina em 3 dias" e
// eram cobrados no 8º dia — o cancelamento do teste nunca cobra.
// ---------------------------------------------------------------------------

const META_TESTE = { tenant_id: TENANT, plan_id: PLAN, plan_code: "GROWTH" };

test("aviso: perdedora do teste da conta e cancelada sem cobrar e nao recebe e-mail", async () => {
  const f = storeComFresca(
    { status: "trialing" },
    { trialHolder: "sub_win", subscriptionsById: { sub_win: trialing("sub_win") } },
  );

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_123", reason: "trial_duplicate" }]);
  assert.deepEqual(f.emails, []);
  assert.deepEqual(f.upserts.map((u) => u.stripe_subscription_id), ["sub_win"]);
  assert.deepEqual(f.funnelEvents, []);
});

test("aviso: cartao ja testado em outra conta e cancelado sem cobrar e nao recebe e-mail", async () => {
  const f = storeComFresca({ status: "trialing" }, { trialHolder: "sub_123", takenFingerprints: ["fp_cartao_a"] });

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, [{ id: "sub_123", reason: "trial_card_reused" }]);
  assert.deepEqual(f.emails, []);
  assert.deepEqual(f.funnelEvents, []);
});

test("aviso: motivo de cancelamento ja gravado (cancel falhou antes) re-cancela e nao manda e-mail", async () => {
  // Sem trialHolder nem cartao tomado: so o motivo gravado manda cancelar. As
  // travas, sozinhas, deixariam passar.
  for (const reason of ["trial_card_reused", "trial_duplicate"] as const) {
    const f = storeComFresca({ status: "trialing", metadata: { ...META_TESTE, cancel_reason: reason } });

    const res = await handleStripeEvent(trialWillEnd(), f.store);

    assert.equal(res.status, 200, reason);
    assert.deepEqual(f.cancels, [{ id: "sub_123", reason }], reason);
    assert.deepEqual(f.emails, [], reason);
  }
});

test("aviso: teste legitimo (reserva propria, cartao proprio) recebe o e-mail e nao reconta trial_started", async () => {
  const f = storeComFresca({ status: "trialing" }, { trialHolder: "sub_123" });

  const res = await handleStripeEvent(trialWillEnd(), f.store);

  assert.equal(res.status, 200);
  assert.deepEqual(f.cancels, []);
  assert.deepEqual(f.emails, ["sub_123"]);
  assert.deepEqual(f.funnelEvents, [], "trial_started ja saiu (ou sai) do checkout");
});

test("aviso: erro do store nas travas devolve 5xx sem marcador e sem e-mail", async () => {
  const cenarios: { nome: string; opts: FakeOptions }[] = [
    { nome: "claimTrial", opts: { claimError: "db fora" } },
    { nome: "cancelTrialSubscription", opts: { cancelError: "stripe 500", takenFingerprints: ["fp_cartao_a"] } },
  ];

  for (const { nome, opts } of cenarios) {
    const f = storeComFresca({ status: "trialing" }, opts);

    const res = await handleStripeEvent(trialWillEnd(), f.store);

    assert.ok(res.status >= 500, `${nome}: o Stripe so reenvia em nao-2xx; veio ${res.status}`);
    assert.equal(f.processedEvents.has("evt_twe"), false, `${nome}: marcador bloquearia o reenvio`);
    assert.deepEqual(f.emails, [], `${nome}: sem trava conferida, nada de aviso de cobranca`);
  }
});
