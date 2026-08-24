import assert from "node:assert/strict";
import { test } from "node:test";

import { detectStripeKeyMode, STRIPE_API_VERSION } from "./stripe-config";

test("reconhece o modo da chave secreta classica", () => {
  assert.equal(detectStripeKeyMode("sk_test_51ABCdef"), "test");
  assert.equal(detectStripeKeyMode("sk_live_51ABCdef"), "live");
});

test("reconhece restricted key, que e o formato que o Stripe recomenda", () => {
  // O guard antigo casava so o prefixo sk_, entao uma rk_live_ em dev passava batida.
  assert.equal(detectStripeKeyMode("rk_test_51ABCdef"), "test");
  assert.equal(detectStripeKeyMode("rk_live_51ABCdef"), "live");
});

test("reconhece a chave publicavel pelo mesmo criterio", () => {
  assert.equal(detectStripeKeyMode("pk_test_51ABCdef"), "test");
  assert.equal(detectStripeKeyMode("pk_live_51ABCdef"), "live");
});

test("ignora espaco em volta, que sobra de copiar e colar do dashboard", () => {
  assert.equal(detectStripeKeyMode("  sk_live_51ABCdef\n"), "live");
});

test("nao arrisca um palpite quando a chave nao declara o modo", () => {
  assert.equal(detectStripeKeyMode(""), "unknown");
  assert.equal(detectStripeKeyMode(undefined), "unknown");
  assert.equal(detectStripeKeyMode(null), "unknown");
  assert.equal(detectStripeKeyMode("whsec_51ABCdef"), "unknown");
  // Formato legado, sem segmento de modo. O guard antigo tambem nao pegava.
  assert.equal(detectStripeKeyMode("sk_51ABCdefGHIjkl"), "unknown");
});

test("o modo so vem do segmento de prefixo, nunca do miolo aleatorio", () => {
  assert.equal(detectStripeKeyMode("sk_live_51_test_ABC"), "live");
});

test("a versao da API do Stripe fica pinada em uma versao explicita", () => {
  // Tripwire de proposito: trocar o pin obriga a editar este teste, e o tsc
  // reclama sozinho quando o SDK sobe de versao (apiVersion e tipo literal).
  assert.equal(STRIPE_API_VERSION, "2026-05-27.dahlia");
});

test("o pin tem o formato de uma versao de API do Stripe", () => {
  assert.match(STRIPE_API_VERSION, /^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/);
});
