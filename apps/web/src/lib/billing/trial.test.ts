import { strict as assert } from "node:assert";
import { test } from "node:test";

import { trialEligible, trialEnabled, trialView, type TrialFacts, type TrialSubscriptionFacts } from "./trial";

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
            cancelAtPeriodEnd: false,
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
    emTeste: { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700, semCobranca: false },
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

test("teste cancelado no portal: continua em teste até o fim, mas sem cobrança", () => {
  // O Stripe mantém `trialing` com cancel_at_period_end até o teste acabar: anunciar a
  // cobrança aqui seria prometer um débito que não vai acontecer.
  const v = trialView(
    facts("sub_trial", {
      status: "trialing",
      stripeSubscriptionId: "sub_trial",
      periodEnd: "2026-10-10T12:00:00.000Z",
      planName: "Growth",
      priceCents: 29700,
      cancelAtPeriodEnd: true,
    }),
  );
  assert.deepEqual(v.emTeste, {
    fim: "2026-10-10T12:00:00.000Z",
    plano: "Growth",
    precoCents: 29700,
    semCobranca: true,
  });
});

test("flag do teste liga com 1/true/on/yes, sem ligar pra caixa nem espaço", () => {
  // A Vercel já entregou flag como "ON": comparar só com "1" desligaria o teste calado.
  for (const v of ["1", "true", "on", "yes", "ON", " On ", "TRUE", "Yes\n"]) {
    assert.equal(trialEnabled(v), true, JSON.stringify(v));
  }
});

test("flag do teste: ausente ou qualquer outro valor é desligado", () => {
  for (const v of [undefined, "", "  ", "0", "false", "off", "no", "2", "enabled", "onn"]) {
    assert.equal(trialEnabled(v), false, JSON.stringify(v));
  }
});
