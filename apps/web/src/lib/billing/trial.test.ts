import { strict as assert } from "node:assert";
import { test } from "node:test";

import { trialEligible, trialView, type TrialFacts, type TrialSubscriptionFacts } from "./trial";

function facts(
  trialSubscriptionId: string | null,
  sub: Partial<TrialSubscriptionFacts> | null,
): TrialFacts {
  return {
    trialSubscriptionId,
    subscription:
      sub === null
        ? null
        : {
            status: null,
            stripeSubscriptionId: null,
            periodEnd: null,
            cancelReason: null,
            planName: null,
            priceCents: null,
            ...sub,
          },
  };
}

test("conta nova, sem assinatura e sem teste, é elegível", () => {
  assert.equal(trialEligible(facts(null, null)), true);
});

test("conta que já usou o teste não é elegível", () => {
  assert.equal(trialEligible(facts("sub_antiga", null)), false);
});

test("conta que já teve assinatura no Stripe não é elegível, mesmo cancelada", () => {
  assert.equal(
    trialEligible(facts(null, { status: "canceled", stripeSubscriptionId: "sub_paga" })),
    false,
  );
});

test("conta parada no FREE antigo (linha sem Stripe) é elegível", () => {
  // São as ~20 contas que ficaram no gratuito depois do paid-first: o melhor público do teste.
  assert.equal(trialEligible(facts(null, { status: "free", stripeSubscriptionId: null })), true);
});

test("em teste: devolve fim, plano e preço", () => {
  const v = trialView(
    facts("sub_trial", {
      status: "trialing",
      stripeSubscriptionId: "sub_trial",
      periodEnd: "2026-10-10T12:00:00.000Z",
      planName: "Growth",
      priceCents: 29700,
    }),
  );
  assert.deepEqual(v, {
    elegivel: false,
    emTeste: { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700 },
    cartaoRepetido: false,
  });
});

test("cartão repetido: cancelada com cancel_reason trial_card_reused", () => {
  const v = trialView(
    facts("sub_trial", {
      status: "canceled",
      stripeSubscriptionId: "sub_trial",
      cancelReason: "trial_card_reused",
    }),
  );
  assert.deepEqual(v, { elegivel: false, emTeste: null, cartaoRepetido: true });
});

test("assinatura ativa: nem oferta, nem teste, nem aviso", () => {
  // Linha realista (com periodEnd/plano/preço): sem isso, tirar o gate `status === "trialing"` passaria despercebido.
  const v = trialView(
    facts("sub_trial", {
      status: "active",
      stripeSubscriptionId: "sub_trial",
      periodEnd: "2026-10-10T12:00:00.000Z",
      planName: "Growth",
      priceCents: 29700,
    }),
  );
  assert.deepEqual(v, { elegivel: false, emTeste: null, cartaoRepetido: false });
});

test("cancel_reason trial_card_reused numa assinatura que não está cancelada não gera aviso", () => {
  const v = trialView(
    facts("sub_trial", {
      status: "active",
      stripeSubscriptionId: "sub_trial",
      cancelReason: "trial_card_reused",
    }),
  );
  assert.equal(v.cartaoRepetido, false);
});
