import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RECUPERAR_MENSAL_CENTS, bloqueioDoRecuperar, checkoutRecuperarParams, precoRecuperar } from "./recuperar-addon";

test("preço mensal fixo e id vindo do ambiente, sem espaço", () => {
  assert.equal(RECUPERAR_MENSAL_CENTS, 12_700);
  const antes = process.env.STRIPE_PRICE_RECUPERAR;
  try {
    process.env.STRIPE_PRICE_RECUPERAR = " price_rc\n";
    assert.equal(precoRecuperar(), "price_rc");
    process.env.STRIPE_PRICE_RECUPERAR = "  ";
    assert.equal(precoRecuperar(), null);
    delete process.env.STRIPE_PRICE_RECUPERAR;
    assert.equal(precoRecuperar(), null);
  } finally {
    if (antes === undefined) delete process.env.STRIPE_PRICE_RECUPERAR;
    else process.env.STRIPE_PRICE_RECUPERAR = antes;
  }
});

test("bloqueios: sem plano vivo, add-on já ativo", () => {
  assert.equal(bloqueioDoRecuperar({ planoStatus: null, recuperarAtivo: false }), "sem_plano");
  for (const ruim of ["canceled", "past_due", "unpaid", "free"]) {
    assert.equal(bloqueioDoRecuperar({ planoStatus: ruim, recuperarAtivo: false }), "sem_plano", ruim);
  }
  assert.equal(bloqueioDoRecuperar({ planoStatus: "active", recuperarAtivo: true }), "ja_assinado");
  assert.equal(bloqueioDoRecuperar({ planoStatus: "trialing", recuperarAtivo: false }), null);
  assert.equal(bloqueioDoRecuperar({ planoStatus: "active", recuperarAtivo: false }), null);
});

test("checkout: uma linha mensal, sem implantação nem cupom, metadata na sessão e na assinatura, volta pro módulo", () => {
  const p = checkoutRecuperarParams({ customerId: "cus_1", precoId: "price_rc", appUrl: "https://app", tenantId: "loja-a" });
  assert.equal(p.mode, "subscription");
  assert.equal(p.customer, "cus_1");
  assert.deepEqual(p.line_items, [{ price: "price_rc", quantity: 1 }]);
  assert.equal("discounts" in p, false);
  assert.deepEqual(p.metadata, { tenant_id: "loja-a", addon: "recuperar" });
  assert.deepEqual(p.subscription_data?.metadata, { tenant_id: "loja-a", addon: "recuperar" });
  assert.equal(p.client_reference_id, "loja-a");
  assert.equal(p.success_url, "https://app/painel/recuperar?assinado=1");
  assert.equal(p.cancel_url, "https://app/painel/recuperar");
  assert.equal(p.payment_method_types?.[0], "card");
});
