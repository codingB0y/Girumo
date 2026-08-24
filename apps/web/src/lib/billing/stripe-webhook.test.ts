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
};

/**
 * Fake que modela o que importa para estes testes: o marcador de idempotencia
 * e o estado da assinatura, ambos com falha injetavel.
 */
function makeStore(options: FakeOptions = {}) {
  const processedEvents = new Set<string>();
  const upserts: SubscriptionRow[] = [];
  const logs: LogRow[] = [];
  const funnelEvents: FunnelInput[] = [];
  let upsertError = options.upsertError ?? null;

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
    async retrieveSubscription() {
      return options.subscription ?? makeSubscription();
    },
    async trackFunnelEvent(input) {
      funnelEvents.push(input);
    },
  };

  return {
    store,
    upserts,
    logs,
    funnelEvents,
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
  paymentStatus: Stripe.Checkout.Session.PaymentStatus,
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

  // 1) cliente gera o boleto: nada de venda
  await handleStripeEvent(makeCheckoutEvent("unpaid"), f.store);
  assert.deepEqual(f.funnelEvents, []);

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
