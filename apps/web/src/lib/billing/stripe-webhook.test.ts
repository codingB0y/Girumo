import { strict as assert } from "node:assert";
import { test } from "node:test";
import type Stripe from "stripe";
import {
  handleStripeEvent,
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

type FakeOptions = { upsertError?: string | null };

/**
 * Fake que modela o que importa para estes testes: o marcador de idempotencia
 * e o estado da assinatura, ambos com falha injetavel.
 */
function makeStore(options: FakeOptions = {}) {
  const processedEvents = new Set<string>();
  const upserts: SubscriptionRow[] = [];
  const logs: LogRow[] = [];
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
      return makeSubscription();
    },
    async trackFunnelEvent() {},
  };

  return {
    store,
    upserts,
    logs,
    processedEvents,
    recuperaBanco: () => {
      upsertError = null;
    },
  };
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
