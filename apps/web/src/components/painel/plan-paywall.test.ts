import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TrialView } from "@/lib/billing/trial";
import { modoDoPaywall, PlanPaywall } from "./plan-paywall";

const ELEGIVEL: TrialView = { elegivel: true, emTeste: null, cartaoRepetido: false };
const TESTE = { fim: "2026-10-10T15:00:00.000Z", plano: "Essencial", precoCents: 9700, semCobranca: false };
const EM_TESTE: TrialView = { elegivel: false, emTeste: TESTE, cartaoRepetido: false };

const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "plan-paywall.tsx"), "utf8");

test("antes da leitura do teste, o diálogo abre carregando, não num modo que vai trocar", () => {
  // No render estático o useTrial nunca lê a API: é o `carregado === false`.
  const h = renderToStaticMarkup(createElement(PlanPaywall, { motivo: "Seu plano chegou ao limite.", onClose: () => {} }));
  assert.match(h, /id="paywall-titulo"[^>]*>Carregando…</);
  assert.doesNotMatch(h, /Escolha um plano|Teste 7 dias grátis|Assinar|Testar grátis|Cancele/);
  // A região viva já existe, vazia: é a mudança de texto depois que o leitor anuncia.
  assert.match(h, /<p role="status" class="sr-only"><\/p>/);
  // O motivo descreve o diálogo para o leitor de tela.
  assert.match(h, /aria-describedby="paywall-motivo"/);
  assert.match(h, /id="paywall-motivo"[^>]*>Seu plano chegou ao limite\./);
});

test("nenhum modo do paywall fala em reembolso", () => {
  // O render estático só alcança o `carregando`: o texto dos outros modos é checado na fonte.
  assert.doesNotMatch(fonte, /reembols|devolu|garantia|desistir|tudo de volta/i);
});

test("sem a leitura do teste, nenhum modo ainda", () => {
  assert.equal(modoDoPaywall(null, false, false, false), "carregando");
  assert.equal(modoDoPaywall(null, true, false, false), "carregando");
});

test("leitura do teste sem resposta no prazo: o paywall de antes, sem esperar mais", () => {
  // A leitura não tem prazo. Com a flag desligada ela não traz nada, e o paywall de
  // antes do teste não pode ficar preso em "Carregando…" esperando por ela.
  assert.equal(modoDoPaywall(null, false, false, true), "normal");
  assert.equal(modoDoPaywall(null, true, false, true), "normal");
});

test("elegível vê o teste", () => {
  assert.equal(modoDoPaywall(ELEGIVEL, false, true, false), "teste");
});

test("em teste não vê plano nenhum: só o caminho de Configurações, aba Plano", () => {
  assert.equal(modoDoPaywall(EM_TESTE, false, true, false), "em_teste");
  // Teste cancelado no portal continua em teste até o fim.
  const cancelado: TrialView = { ...EM_TESTE, emTeste: { ...TESTE, semCobranca: true } };
  assert.equal(modoDoPaywall(cancelado, false, true, false), "em_teste");
  // Mesmo se as duas coisas vierem juntas, teste em andamento ganha.
  assert.equal(modoDoPaywall({ ...EM_TESTE, elegivel: true }, false, true, false), "em_teste");
  assert.equal(modoDoPaywall(EM_TESTE, true, true, false), "em_teste");
  // A leitura que chega depois do prazo ainda manda: N botões "Assinar" dariam 409.
  assert.equal(modoDoPaywall(EM_TESTE, false, true, true), "em_teste");
});

test("voltando do Checkout (ativando) não oferece o teste de novo", () => {
  assert.equal(modoDoPaywall(ELEGIVEL, true, true, false), "normal");
});

test("leitura falhou, ou fora do teste, o paywall de antes", () => {
  assert.equal(modoDoPaywall(null, false, true, false), "normal");
  assert.equal(modoDoPaywall(null, true, true, false), "normal");
  assert.equal(modoDoPaywall({ elegivel: false, emTeste: null, cartaoRepetido: true }, false, true, false), "normal");
});
