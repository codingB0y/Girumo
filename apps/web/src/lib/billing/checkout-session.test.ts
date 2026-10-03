import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkoutSessionParams } from "./checkout-session";

const BASE = {
  customerId: "cus_1",
  priceId: "price_1",
  appUrl: "https://app.girumo.com.br",
  tenantId: "t1",
  planId: "p1",
  planCode: "GROWTH",
};

test("sem teste, a sessão é exatamente a de antes do teste grátis", () => {
  // Boleto continua vindo do Dashboard: nada de payment_method_types aqui.
  assert.deepEqual(checkoutSessionParams({ ...BASE, comTeste: false }), {
    mode: "subscription",
    customer: "cus_1",
    line_items: [{ price: "price_1", quantity: 1 }],
    success_url: "https://app.girumo.com.br/painel/configuracoes?billing=success",
    cancel_url: "https://app.girumo.com.br/painel/configuracoes?billing=cancelled",
    client_reference_id: "t1",
    metadata: { tenant_id: "t1", plan_id: "p1", plan_code: "GROWTH" },
    subscription_data: { metadata: { tenant_id: "t1", plan_id: "p1", plan_code: "GROWTH" } },
  });
});

test("com teste: só cartão, 7 dias, cancela sem cartão e volta pro painel", () => {
  const p = checkoutSessionParams({ ...BASE, comTeste: true });
  assert.deepEqual(p.payment_method_types, ["card"]);
  assert.equal(p.payment_method_collection, "always");
  assert.equal(p.subscription_data?.trial_period_days, 7);
  assert.deepEqual(p.subscription_data?.trial_settings, {
    end_behavior: { missing_payment_method: "cancel" },
  });
  assert.deepEqual(p.subscription_data?.metadata, {
    tenant_id: "t1",
    plan_id: "p1",
    plan_code: "GROWTH",
    trial: "1",
  });
  assert.equal(p.success_url, "https://app.girumo.com.br/painel?billing=trial_started");
  assert.equal(p.customer, "cus_1");
});
