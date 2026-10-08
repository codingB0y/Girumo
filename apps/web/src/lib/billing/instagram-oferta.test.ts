import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bloqueioDaOferta, checkoutInstagramParams, cotacao, metadataAddon, subscriptionInstagramParams } from "./instagram-oferta";

const PRECOS = { mensal: "price_m", implantacao: "price_i" };

test("cotação: hoje = implementação com desconto + mensalidade", () => {
  assert.deepEqual(cotacao(100), { descontoPercent: 100, implantacaoCheiaCents: 49_700, implantacaoCents: 0, mensalCents: 29_700, totalHojeCents: 29_700 });
  assert.deepEqual(cotacao(0).totalHojeCents, 79_400);
  assert.deepEqual(cotacao(50).implantacaoCents, 24_850);
});

test("bloqueios: sem plano vivo, add-on já ativo, papel sem cobrança", () => {
  assert.equal(bloqueioDaOferta({ planoStatus: null, instagramAtivo: false }), "sem_plano");
  assert.equal(bloqueioDaOferta({ planoStatus: "canceled", instagramAtivo: false }), "sem_plano");
  assert.equal(bloqueioDaOferta({ planoStatus: "past_due", instagramAtivo: false }), "sem_plano");
  assert.equal(bloqueioDaOferta({ planoStatus: "active", instagramAtivo: true }), "ja_assinado");
  assert.equal(bloqueioDaOferta({ planoStatus: "trialing", instagramAtivo: false }), null);
  assert.equal(bloqueioDaOferta({ planoStatus: "active", instagramAtivo: false }), null);
});

test("metadata marca o add-on e a loja; convite só quando há", () => {
  assert.deepEqual(metadataAddon("loja-a", null), { tenant_id: "loja-a", addon: "instagram" });
  assert.deepEqual(metadataAddon("loja-a", "conv-1"), { tenant_id: "loja-a", addon: "instagram", invite_id: "conv-1" });
});

test("assinatura no cartão salvo: mensal + implementação na 1ª fatura com o cupom só nela; cobra na hora", () => {
  const p = subscriptionInstagramParams({ customerId: "cus_1", paymentMethodId: "pm_1", precos: PRECOS, tenantId: "loja-a", inviteId: "conv-1", cupomId: "cup_1" });
  assert.deepEqual(p, {
    customer: "cus_1",
    default_payment_method: "pm_1",
    items: [{ price: "price_m", quantity: 1 }],
    add_invoice_items: [{ price: "price_i", quantity: 1, discounts: [{ coupon: "cup_1" }] }],
    payment_behavior: "allow_incomplete",
    metadata: { tenant_id: "loja-a", addon: "instagram", invite_id: "conv-1" },
    expand: ["latest_invoice"],
  });
  const semCupom = subscriptionInstagramParams({ customerId: "cus_1", paymentMethodId: "pm_1", precos: PRECOS, tenantId: "loja-a", inviteId: null, cupomId: null });
  assert.deepEqual(semCupom.add_invoice_items, [{ price: "price_i", quantity: 1 }]);
  assert.deepEqual(semCupom.metadata, { tenant_id: "loja-a", addon: "instagram" });
});

test("checkout: duas linhas, cupom na sessão, metadata na assinatura, volta pro painel", () => {
  const p = checkoutInstagramParams({ customerId: "cus_1", precos: PRECOS, appUrl: "https://app", tenantId: "loja-a", inviteId: "conv-1", cupomId: "cup_1", voltar: "/painel/instagram/assinar?convite=x" });
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: "price_m", quantity: 1 }, { price: "price_i", quantity: 1 }]);
  assert.deepEqual(p.discounts, [{ coupon: "cup_1" }]);
  assert.deepEqual(p.subscription_data?.metadata, { tenant_id: "loja-a", addon: "instagram", invite_id: "conv-1" });
  assert.deepEqual(p.metadata, { tenant_id: "loja-a", addon: "instagram", invite_id: "conv-1" });
  assert.equal(p.success_url, "https://app/painel/instagram?assinado=1");
  assert.equal(p.cancel_url, "https://app/painel/instagram/assinar?convite=x");
  assert.equal(p.payment_method_types?.[0], "card");
  const semCupom = checkoutInstagramParams({ customerId: "cus_1", precos: PRECOS, appUrl: "https://app", tenantId: "loja-a", inviteId: null, cupomId: null, voltar: "/painel/instagram/assinar" });
  assert.equal("discounts" in semCupom, false);
});
