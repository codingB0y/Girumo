import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TrialView } from "@/lib/billing/trial";
import { modoDoPaywall, PlanPaywall } from "./plan-paywall";

const ELEGIVEL: TrialView = { elegivel: true, emTeste: null, cartaoRepetido: false };
const TESTE = { fim: "2026-10-10T15:00:00.000Z", plano: "Essencial", precoCents: 9700, semCobranca: false };
const EM_TESTE: TrialView = { elegivel: false, emTeste: TESTE, cartaoRepetido: false };

test("sem leitura do teste (view nulo), o paywall de antes: sem reembolso, com o rodapé fixo", () => {
  // No render estático o useTrial nunca lê a API: é o modo `view === null`.
  const h = renderToStaticMarkup(createElement(PlanPaywall, { motivo: "Seu plano chegou ao limite.", onClose: () => {} }));
  assert.match(h, /Cancele quando quiser, sem multa\./);
  assert.doesNotMatch(h, /de volta|reembols|devolu|garantia|desistir/i);
  // O motivo descreve o diálogo para o leitor de tela.
  assert.match(h, /aria-describedby="paywall-motivo"/);
  assert.match(h, /id="paywall-motivo"[^>]*>Seu plano chegou ao limite\./);
});

test("elegível vê o teste", () => {
  assert.equal(modoDoPaywall(ELEGIVEL, false), "teste");
});

test("em teste não vê plano nenhum: só o caminho de Configurações › Plano", () => {
  assert.equal(modoDoPaywall(EM_TESTE, false), "em_teste");
  // Teste cancelado no portal continua em teste até o fim.
  const cancelado: TrialView = { ...EM_TESTE, emTeste: { ...TESTE, semCobranca: true } };
  assert.equal(modoDoPaywall(cancelado, false), "em_teste");
  // Mesmo se as duas coisas vierem juntas, teste em andamento ganha.
  assert.equal(modoDoPaywall({ ...EM_TESTE, elegivel: true }, false), "em_teste");
  assert.equal(modoDoPaywall(EM_TESTE, true), "em_teste");
});

test("voltando do Checkout (ativando) não oferece o teste de novo", () => {
  assert.equal(modoDoPaywall(ELEGIVEL, true), "normal");
});

test("sem leitura, ou fora do teste, o paywall de antes", () => {
  assert.equal(modoDoPaywall(null, false), "normal");
  assert.equal(modoDoPaywall(null, true), "normal");
  assert.equal(modoDoPaywall({ elegivel: false, emTeste: null, cartaoRepetido: true }, false), "normal");
});
