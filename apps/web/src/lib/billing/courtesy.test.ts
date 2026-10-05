import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonths,
  courtesyCreateParams,
  courtesyDecision,
  courtesyMetadata,
  courtesyResumesAt,
  courtesyUpdateParams,
  hasLiveSubscription,
  parseCourtesyMonths,
} from "./courtesy";

const AGORA = new Date("2026-10-05T12:00:00.000Z");

test("meses aceitos: inteiro de 1 a 36, como número ou texto", () => {
  assert.equal(parseCourtesyMonths(3), 3);
  assert.equal(parseCourtesyMonths("12"), 12);
  assert.equal(parseCourtesyMonths(36), 36);
  for (const ruim of [0, -1, 1.5, 37, "", " ", "abc", null, undefined, "2x"]) {
    assert.equal(parseCourtesyMonths(ruim), null, `aceitou ${String(ruim)}`);
  }
});

test("addMonths encosta no fim do mês curto", () => {
  assert.equal(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(addMonths(new Date("2026-11-15T10:00:00Z"), 3).toISOString(), "2027-02-15T10:00:00.000Z");
});

test("decisão: ativa e em teste recebem o cupom; morta ou ausente ganha assinatura nova", () => {
  assert.deepEqual(courtesyDecision({ status: "active", cancelScheduled: false }), { kind: "update" });
  assert.deepEqual(courtesyDecision({ status: "trialing", cancelScheduled: false }), { kind: "update" });
  assert.deepEqual(courtesyDecision(null), { kind: "create" });
  assert.deepEqual(courtesyDecision({ status: "canceled", cancelScheduled: false }), { kind: "create" });
  assert.deepEqual(courtesyDecision({ status: "incomplete_expired", cancelScheduled: false }), { kind: "create" });
});

test("decisão: recusa cobrança pendente e cancelamento agendado", () => {
  for (const status of ["past_due", "unpaid", "incomplete", "paused"] as const) {
    assert.equal(courtesyDecision({ status, cancelScheduled: false }).kind, "refuse", status);
  }
  // Voltar a cobrar quem pediu pra parar não é cortesia.
  assert.equal(courtesyDecision({ status: "active", cancelScheduled: true }).kind, "refuse");
});

test("criar só quando o Customer não tem assinatura viva no Stripe", () => {
  assert.equal(hasLiveSubscription([]), false);
  assert.equal(hasLiveSubscription(["canceled", "incomplete_expired"]), false);
  // A do Dashboard sem metadata, ou o checkout cujo webhook ainda não chegou.
  assert.equal(hasLiveSubscription(["canceled", "active"]), true);
  assert.equal(hasLiveSubscription(["past_due"]), true);
});

test("assinatura ativa: os meses grátis começam depois do período já pago", () => {
  const fimDoPeriodo = Date.parse("2026-10-20T00:00:00Z") / 1000;
  const volta = courtesyResumesAt({ status: "active", currentPeriodEnd: fimDoPeriodo, now: AGORA, months: 3 });
  assert.equal(volta.toISOString(), "2027-01-20T00:00:00.000Z");
});

test("assinatura nova ou em teste: os meses grátis começam agora", () => {
  const fimDoTeste = Date.parse("2026-10-09T00:00:00Z") / 1000;
  assert.equal(
    courtesyResumesAt({ status: "trialing", currentPeriodEnd: fimDoTeste, now: AGORA, months: 2 }).toISOString(),
    "2026-12-05T12:00:00.000Z",
  );
  assert.equal(
    courtesyResumesAt({ status: null, currentPeriodEnd: null, now: AGORA, months: 1 }).toISOString(),
    "2026-11-05T12:00:00.000Z",
  );
});

test("metadata leva o contrato do webhook e apaga motivo antigo", () => {
  const meta = courtesyMetadata({
    tenantId: "t1",
    planId: "p1",
    planCode: "GROWTH",
    months: 3,
    resumesAt: AGORA,
    adminEmail: "admin@girumo.com",
  });
  // Sem tenant_id/plan_id o webhook não grava a assinatura (missing_metadata).
  assert.equal(meta.tenant_id, "t1");
  assert.equal(meta.plan_id, "p1");
  assert.equal(meta.plan_code, "GROWTH");
  assert.equal(meta.courtesy_until, AGORA.toISOString());
  assert.equal(meta.courtesy_reason, "");
});

test("update: troca o preço só quando o plano muda, e encerra o teste", () => {
  const base = { itemId: "si_1", priceId: "price_growth", couponId: "cortesia-100-3m", metadata: {} };

  const mesmoPlano = courtesyUpdateParams({ ...base, currentPriceId: "price_growth", trialing: false });
  assert.equal(mesmoPlano.items, undefined);
  assert.equal(mesmoPlano.trial_end, undefined);
  assert.deepEqual(mesmoPlano.discounts, [{ coupon: "cortesia-100-3m" }]);
  assert.equal(mesmoPlano.proration_behavior, "none");

  const outroPlano = courtesyUpdateParams({ ...base, currentPriceId: "price_essencial", trialing: true });
  assert.deepEqual(outroPlano.items, [{ id: "si_1", price: "price_growth" }]);
  assert.equal(outroPlano.trial_end, "now");
});

test("create: usa o cartão salvo quando existe", () => {
  const base = { customerId: "cus_1", priceId: "price_growth", couponId: "cortesia-100-1m", metadata: {} };
  assert.equal(courtesyCreateParams({ ...base, paymentMethodId: "pm_1" }).default_payment_method, "pm_1");
  assert.equal("default_payment_method" in courtesyCreateParams({ ...base, paymentMethodId: null }), false);
});
