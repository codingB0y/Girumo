import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkoutSessionParams, trialApplies, trialCheckoutDecision } from "./checkout-session";
import type { TrialFacts } from "./trial";

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

const ELEGIVEL: TrialFacts = { trialSubscriptionId: null, subscription: null };
const JA_TESTOU: TrialFacts = { trialSubscriptionId: "sub_1", subscription: null };

test("semTeste === true tira o teste mesmo da conta elegível (caminho do boleto)", () => {
  assert.equal(trialApplies(true, ELEGIVEL), false);
});

test("conta que já testou não ganha teste, pedindo ou não", () => {
  assert.equal(trialApplies(undefined, JA_TESTOU), false);
  assert.equal(trialApplies(false, JA_TESTOU), false);
});

test("conta elegível sem pedido de 'sem teste' ganha o teste", () => {
  assert.equal(trialApplies(undefined, ELEGIVEL), true);
  assert.equal(trialApplies(false, ELEGIVEL), true);
});

test("só o booleano true desiste do teste: a string \"true\" não conta", () => {
  assert.equal(trialApplies("true", ELEGIVEL), true);
});

const AGORA = new Date("2026-10-03T12:00:00.000Z");

test("com teste, a sessão expira em 31 min: encolhe a janela de uma sessão velha concluir depois", () => {
  const p = checkoutSessionParams({ ...BASE, comTeste: true }, AGORA);
  assert.equal(p.expires_at, Math.floor(AGORA.getTime() / 1000) + 31 * 60);
});

test("sem teste, nada de expires_at: a sessão do boleto fica como sempre foi", () => {
  assert.equal("expires_at" in checkoutSessionParams({ ...BASE, comTeste: false }, AGORA), false);
});

const EM_TESTE: TrialFacts = {
  trialSubscriptionId: "sub_trial",
  subscription: {
    status: "trialing",
    stripeSubscriptionId: "sub_trial",
    periodEnd: "2026-10-10T12:00:00.000Z",
    cancelReason: null,
    planName: "Growth",
    priceCents: 29700,
    cancelAtPeriodEnd: false,
  },
};

function leitor(facts: TrialFacts) {
  const chamadas = { n: 0 };
  return {
    chamadas,
    readFacts: async () => {
      chamadas.n += 1;
      return facts;
    },
  };
}

test("flag desligada: nem lê os fatos, nem dá teste, nem bloqueia — o checkout de antes", async () => {
  for (const facts of [ELEGIVEL, EM_TESTE]) {
    const r = leitor(facts);
    assert.equal(await trialCheckoutDecision({ enabled: false, semTeste: undefined, readFacts: r.readFacts }), "sem_teste");
    assert.equal(r.chamadas.n, 0);
  }
});

test("flag ligada e conta em teste: bloqueia, boleto incluso — senão nasce uma 2ª assinatura", async () => {
  for (const semTeste of [undefined, false, true]) {
    const r = leitor(EM_TESTE);
    assert.equal(await trialCheckoutDecision({ enabled: true, semTeste, readFacts: r.readFacts }), "em_teste");
  }
});

test("flag ligada: boleto também lê os fatos (é o que deixa ver o teste em andamento)", async () => {
  const r = leitor(ELEGIVEL);
  assert.equal(await trialCheckoutDecision({ enabled: true, semTeste: true, readFacts: r.readFacts }), "sem_teste");
  assert.equal(r.chamadas.n, 1);
});

test("flag ligada: assinante ativo ou inadimplente segue pro checkout, sem 409", async () => {
  for (const status of ["active", "past_due"]) {
    const facts: TrialFacts = {
      trialSubscriptionId: null,
      subscription: { ...EM_TESTE.subscription!, status, stripeSubscriptionId: "sub_pago" },
    };
    const r = leitor(facts);
    assert.equal(await trialCheckoutDecision({ enabled: true, semTeste: undefined, readFacts: r.readFacts }), "sem_teste");
  }
});

test("flag ligada e conta elegível: ganha o teste", async () => {
  const r = leitor(ELEGIVEL);
  assert.equal(await trialCheckoutDecision({ enabled: true, semTeste: undefined, readFacts: r.readFacts }), "com_teste");
});

test("flag ligada: erro ao ler os fatos sobe — nada de checkout no escuro", async () => {
  const falha = new Error("banco fora");
  await assert.rejects(
    trialCheckoutDecision({ enabled: true, semTeste: true, readFacts: async () => Promise.reject(falha) }),
    falha,
  );
});
