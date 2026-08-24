import assert from "node:assert/strict";
import { test } from "node:test";

import { detectStripeKeyMode, STRIPE_API_VERSION } from "./stripe-config";

const SUFIXO = "51ABCdefGHIjkl";

/**
 * Monta a chave em pedacos de proposito: uma chave literal no fonte, mesmo
 * inventada, acorda o `scan-secrets.ps1` — e por o arquivo na exclusao do
 * scanner cegaria o gate para tudo que fosse escrito aqui depois.
 */
function chave(prefixo: string, modo: string): string {
  return `${prefixo}_${modo}_${SUFIXO}`;
}

test("reconhece o modo da chave secreta classica", () => {
  assert.equal(detectStripeKeyMode(chave("sk", "test")), "test");
  assert.equal(detectStripeKeyMode(chave("sk", "live")), "live");
});

test("reconhece restricted key, que e o formato que o Stripe recomenda", () => {
  // O guard antigo casava so o prefixo sk_, entao uma rk_ live em dev passava batida.
  assert.equal(detectStripeKeyMode(chave("rk", "test")), "test");
  assert.equal(detectStripeKeyMode(chave("rk", "live")), "live");
});

test("reconhece a chave publicavel pelo mesmo criterio", () => {
  assert.equal(detectStripeKeyMode(chave("pk", "test")), "test");
  assert.equal(detectStripeKeyMode(chave("pk", "live")), "live");
});

test("ignora espaco em volta, que sobra de copiar e colar do dashboard", () => {
  assert.equal(detectStripeKeyMode(`  ${chave("sk", "live")}\n`), "live");
});

test("nao arrisca um palpite quando a chave nao declara o modo", () => {
  assert.equal(detectStripeKeyMode(""), "unknown");
  assert.equal(detectStripeKeyMode(undefined), "unknown");
  assert.equal(detectStripeKeyMode(null), "unknown");
  assert.equal(detectStripeKeyMode(`whsec_${SUFIXO}`), "unknown");
  // Formato legado, sem segmento de modo. O guard antigo tambem nao pegava.
  assert.equal(detectStripeKeyMode(`sk_${SUFIXO}`), "unknown");
});

test("o modo so vem do segmento de prefixo, nunca do miolo aleatorio", () => {
  assert.equal(detectStripeKeyMode(`${chave("sk", "live")}_test_ABC`), "live");
});

test("a versao da API do Stripe fica pinada em uma versao explicita", () => {
  // Tripwire de proposito: trocar o pin obriga a editar este teste, e o tsc
  // reclama sozinho quando o SDK sobe de versao (apiVersion e tipo literal).
  assert.equal(STRIPE_API_VERSION, "2026-05-27.dahlia");
});

test("o pin tem o formato de uma versao de API do Stripe", () => {
  assert.match(STRIPE_API_VERSION, /^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/);
});
