import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { subscriptionNotice } from "@/lib/billing/subscription-access";
import { AbaPlano, type PropsDoPlano } from "./aba-plano";

const noop = () => {};
/** 12:00 de Brasília em 10/10: a tela mostra "10/10". */
const FIM = "2026-10-10T15:00:00.000Z";

function html(over: Partial<PropsDoPlano> = {}): string {
  const props: PropsDoPlano = {
    carga: "ok",
    nome: "Growth",
    codigo: "GROWTH",
    vigente: true,
    recado: null,
    renovaEm: FIM,
    estado: "active",
    precoCents: 29700,
    planos: [],
    cargaDosPlanos: "ok",
    assinando: null,
    abrindoPortal: false,
    erro: null,
    onAssinar: noop,
    onPortal: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(AbaPlano, props));
}

test("assinatura paga continua como era: Ativa, Renova em, Cancelar assinatura", () => {
  const h = html();
  assert.match(h, />Ativa</);
  assert.match(h, /Renova em 10\/10/);
  assert.match(h, /Cancelar assinatura/);
});

test("teste mostra data e valor da 1ª cobrança e nunca Renova em", () => {
  const h = html({ estado: "trial", recado: subscriptionNotice("trial", FIM) });
  assert.match(h, />Teste grátis</);
  assert.match(h, /Teste grátis · 1ª cobrança de R\$\s?297 em 10\/10/);
  assert.match(h, /Cancelar teste \(sem cobrança\)/);
  assert.doesNotMatch(h, /Renova em|>Ativa<|Cancelar assinatura/);
});

test("teste sem preço conhecido não inventa valor", () => {
  const h = html({ estado: "trial", precoCents: null, recado: subscriptionNotice("trial", FIM) });
  assert.match(h, /Teste grátis · 1ª cobrança em 10\/10/);
  assert.doesNotMatch(h, /R\$/);
});

test("teste cancelado no portal termina sem cobrança e nunca anuncia a cobrança", () => {
  const h = html({ estado: "trial_canceled", recado: subscriptionNotice("trial_canceled", FIM) });
  assert.match(h, /Teste cancelado — termina em 10\/10 sem cobrança\./);
  assert.doesNotMatch(h, /Renova em|1ª cobrança|R\$/);
  // Já cancelado: oferecer "cancelar" de novo confunde. O portal desfaz, se quiser.
  assert.doesNotMatch(h, /Cancelar teste|Cancelar assinatura/);
  assert.match(h, /Gerenciar cobrança/);
});

test("erro do checkout chega à tela (409 de quem está no teste)", () => {
  const msg = "Você está no teste grátis. Para trocar de plano, use Gerenciar cobrança.";
  const h = html({ estado: "trial", erro: msg });
  assert.match(h, /role="alert"/);
  assert.ok(h.includes(msg));
});

test("nenhum estado do teste fala em reembolso", () => {
  const todos = [
    html({ estado: "trial", recado: subscriptionNotice("trial", FIM) }),
    html({ estado: "trial_canceled", recado: subscriptionNotice("trial_canceled", FIM) }),
    html({ estado: "trial_card_reused", vigente: false, recado: subscriptionNotice("trial_card_reused") }),
  ].join("\n");
  assert.doesNotMatch(todos, /reembols|devolu|garantia/i);
});
