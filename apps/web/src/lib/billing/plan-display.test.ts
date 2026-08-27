import test from "node:test";
import assert from "node:assert/strict";

import { formatarPreco, planosParaOferecer } from "./plan-display";

const CATALOGO = [
  { code: "FREE", name: "FREE", price_cents: 0, stripe_price_id: null, sort_order: 0 },
  { code: "ESSENCIAL", name: "Essencial", price_cents: 19700, stripe_price_id: "price_a", sort_order: 2 },
  { code: "GROWTH", name: "Growth", price_cents: 29700, stripe_price_id: "price_b", sort_order: 1 },
  { code: "PERFORMANCE_MAX", name: "Operação", price_cents: 49700, stripe_price_id: "price_c", sort_order: 3 },
  // Plano PAGO sem price id no Stripe — o caso perigoso de verdade. Ja
  // aconteceu neste projeto: os quatro planos ficaram com stripe_price_id nulo
  // e o checkout respondia 400. O FREE nao cobre este cenario, porque ele ja
  // sai pelo filtro de preco.
  { code: "LEGADO", name: "Legado", price_cents: 9700, stripe_price_id: null, sort_order: 4 },
];

test("preco redondo nao mostra centavos", () => {
  // "R$ 197,00" num card de assinatura so adiciona ruido; o preco e redondo.
  assert.equal(formatarPreco(19700), "R$ 197");
  assert.equal(formatarPreco(49700), "R$ 497");
});

test("preco quebrado mostra centavos", () => {
  assert.equal(formatarPreco(19750), "R$ 197,50");
});

test("nao oferece o FREE nem plano sem preco no Stripe", () => {
  // Oferecer o FREE a quem JA esta nele e o convite a nao fazer nada. E plano
  // sem `stripe_price_id` leva a um checkout que responde 400 — botao que so
  // pode falhar e pior que botao ausente.
  const oferta = planosParaOferecer(CATALOGO);
  assert.deepEqual(oferta.map((p) => p.code), ["GROWTH", "ESSENCIAL", "PERFORMANCE_MAX"]);
});

test("respeita a ordem do catalogo, nao a do banco", () => {
  // `sort_order` existe para o dono do produto decidir o que aparece primeiro.
  const oferta = planosParaOferecer(CATALOGO);
  assert.equal(oferta[0].code, "GROWTH", "sort_order 1 tem de vir primeiro");
});

test("catalogo vazio ou torto nao quebra a tela", () => {
  // Esta lista alimenta um paywall que abre EM CIMA de um erro. Se ela estourar,
  // o cliente perde tambem a mensagem que explicava o bloqueio.
  assert.deepEqual(planosParaOferecer([]), []);
  assert.deepEqual(planosParaOferecer(null as never), []);
  assert.deepEqual(planosParaOferecer([{ code: "X" } as never]), []);
});
