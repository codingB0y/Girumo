import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveCheckoutCustomerId,
  stripeCustomerIdempotencyKey,
  type CheckoutCustomerDeps,
} from "./checkout-customer";

const TENANT = "11111111-1111-4111-8111-111111111111";

type Spy = {
  deps: CheckoutCustomerDeps;
  created: string[];
  claimed: string[];
};

function makeDeps(overrides: Partial<CheckoutCustomerDeps> = {}): Spy {
  const created: string[] = [];
  const claimed: string[] = [];

  const deps: CheckoutCustomerDeps = {
    tenantId: TENANT,
    email: "lojista@exemplo.com",
    readTenantCustomerId: async () => null,
    readSubscriptionCustomerId: async () => null,
    createCustomer: async ({ idempotencyKey }) => {
      created.push(idempotencyKey);
      return "cus_novo";
    },
    claimCustomerId: async (customerId) => {
      claimed.push(customerId);
      return customerId;
    },
    ...overrides,
  };

  return { deps, created, claimed };
}

test("reusa o customer ja gravado no tenant sem chamar o Stripe", async () => {
  const spy = makeDeps({ readTenantCustomerId: async () => "cus_salvo" });

  assert.equal(await resolveCheckoutCustomerId(spy.deps), "cus_salvo");
  assert.deepEqual(spy.created, []);
  assert.deepEqual(spy.claimed, []);
});

test("adota o customer que o webhook gravou em subscriptions e o promove para o tenant", async () => {
  const spy = makeDeps({ readSubscriptionCustomerId: async () => "cus_do_webhook" });

  assert.equal(await resolveCheckoutCustomerId(spy.deps), "cus_do_webhook");
  assert.deepEqual(spy.created, [], "customer que ja existe nao pode ser recriado");
  assert.deepEqual(spy.claimed, ["cus_do_webhook"]);
});

test("nem consulta subscriptions quando o tenant ja resolve", async () => {
  let leituras = 0;
  const spy = makeDeps({
    readTenantCustomerId: async () => "cus_salvo",
    readSubscriptionCustomerId: async () => {
      leituras += 1;
      return "cus_do_webhook";
    },
  });

  await resolveCheckoutCustomerId(spy.deps);
  assert.equal(leituras, 0);
});

test("so cria no Stripe quando nao existe nenhum, e grava o que criou", async () => {
  const spy = makeDeps();

  assert.equal(await resolveCheckoutCustomerId(spy.deps), "cus_novo");
  assert.equal(spy.created.length, 1);
  assert.equal(spy.created[0], stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"));
  assert.deepEqual(spy.claimed, ["cus_novo"]);
});

test("na corrida, devolve o customer que ganhou a escrita e nao o que acabou de criar", async () => {
  // Duas abas abrem o checkout juntas: as duas leem vazio e as duas criam.
  // Quem perde a escrita tem que seguir com o customer do vencedor, senao o
  // app aponta para um customer que ninguem mais referencia.
  const spy = makeDeps({ claimCustomerId: async () => "cus_do_vencedor" });

  assert.equal(await resolveCheckoutCustomerId(spy.deps), "cus_do_vencedor");
});

test("a idempotency key e estavel para o mesmo tenant e o mesmo e-mail", () => {
  assert.equal(
    stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"),
    stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"),
  );
  // Um retry do mesmo checkout abandonado tem que cair na mesma chave, senao o
  // Stripe cria outro Customer.
  assert.equal(
    stripeCustomerIdempotencyKey(TENANT, "  Lojista@Exemplo.com  "),
    stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"),
  );
});

test("a idempotency key muda quando o corpo da chamada muda", () => {
  // Corpo diferente com a mesma chave e erro 409 no Stripe. Como o e-mail entra
  // no corpo, ele precisa entrar na chave.
  const outroTenant = "22222222-2222-4222-8222-222222222222";

  assert.notEqual(
    stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"),
    stripeCustomerIdempotencyKey(TENANT, "outro@exemplo.com"),
  );
  assert.notEqual(
    stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"),
    stripeCustomerIdempotencyKey(outroTenant, "lojista@exemplo.com"),
  );
  assert.notEqual(
    stripeCustomerIdempotencyKey(TENANT, null),
    stripeCustomerIdempotencyKey(TENANT, "lojista@exemplo.com"),
  );
});

test("a idempotency key cabe no limite de 255 caracteres do Stripe", () => {
  const emailLongo = `${"a".repeat(240)}@exemplo.com`;

  assert.ok(stripeCustomerIdempotencyKey(TENANT, emailLongo).length <= 255);
  assert.ok(stripeCustomerIdempotencyKey(TENANT, null).length <= 255);
});
