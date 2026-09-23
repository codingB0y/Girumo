import test from "node:test";
import assert from "node:assert/strict";

import { PLANS } from "@/components/lp3/landing-data";
import { LP_FAQ, MAX_OFF, PERGUNTA_ANUAL } from "./lp-data";

test("a resposta do plano anual sai de PLANS, nao de texto digitado", () => {
  const anual = LP_FAQ.find(([pergunta]) => pergunta === PERGUNTA_ANUAL);
  // Se a pergunta mudar de texto no LP3_FAQ, a troca some em silêncio: este teste avisa.
  assert.ok(anual, "pergunta do anual sumiu do FAQ");
  const plano = PLANS.find((p) => p.featured);
  assert.ok(plano);
  const devolvido = (plano.annualPrice * 12 - 3 * plano.price).toLocaleString("pt-BR");
  assert.ok(anual[1].includes(`até ${MAX_OFF}% mais barato`), anual[1]);
  assert.ok(anual[1].includes(`R$ ${plano.annualPrice} em vez de R$ ${plano.price}`), anual[1]);
  assert.ok(anual[1].endsWith(`voltam R$ ${devolvido}.`), anual[1]);
});

test("o FAQ das landings tem a pergunta do risco do numero logo apos a do numero", () => {
  assert.equal(LP_FAQ[0][0], "Preciso trocar de número?");
  assert.equal(LP_FAQ[1][0], "Meu número corre risco?");
  assert.equal(new Set(LP_FAQ.map(([pergunta]) => pergunta)).size, LP_FAQ.length);
});
