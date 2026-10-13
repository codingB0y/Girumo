import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CONVITE_VALIDADE_MS,
  IMPLANTACAO_CENTS,
  MENSAL_CENTS,
  cupomDoConvite,
  formatarReais,
  hashToken,
  implantacaoComDesconto,
  novoTokenConvite,
  parseDesconto,
} from "./instagram-addon";

test("valores do add-on e o desconto só na implementação", () => {
  assert.equal(IMPLANTACAO_CENTS, 49_700);
  assert.equal(MENSAL_CENTS, 29_700);
  assert.equal(implantacaoComDesconto(100), 0);
  assert.equal(implantacaoComDesconto(0), 49_700);
  assert.equal(implantacaoComDesconto(50), 24_850);
  // Stripe arredonda o percent_off por linha; o arredondamento aqui é o mesmo (centavo mais próximo).
  assert.equal(implantacaoComDesconto(33), 33_299);
  assert.equal(formatarReais(49_700), "R$ 497,00");
  assert.equal(formatarReais(0), "R$ 0,00");
  assert.equal(formatarReais(24_850), "R$ 248,50");
});

test("desconto aceita só inteiro de 0 a 100", () => {
  assert.equal(parseDesconto(100), 100);
  assert.equal(parseDesconto("50"), 50);
  assert.equal(parseDesconto(0), 0);
  for (const ruim of [-1, 101, 12.5, "abc", null, undefined, "", true]) assert.equal(parseDesconto(ruim), null, String(ruim));
});

test("token aleatório; o banco só vê o hash", () => {
  const a = novoTokenConvite();
  const b = novoTokenConvite();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a.token), a.hash);
  assert.notEqual(a.hash, a.token);
});

test("cupom: percentual, uma vez, só no produto da implementação, um uso, vence com o convite", () => {
  const vence = new Date("2026-10-14T12:00:00Z");
  const c = cupomDoConvite(100, "prod_impl", vence, "conv-1");
  assert.deepEqual(c, {
    percent_off: 100,
    duration: "once",
    applies_to: { products: ["prod_impl"] },
    max_redemptions: 1,
    redeem_by: Math.floor(vence.getTime() / 1000),
    name: "Implementação Instagram 100%",
    metadata: { addon: "instagram", invite_id: "conv-1" },
  });
  assert.equal(cupomDoConvite(0, "prod_impl", vence, "conv-2"), null);
  assert.equal(CONVITE_VALIDADE_MS, 7 * 24 * 60 * 60 * 1000);
});
