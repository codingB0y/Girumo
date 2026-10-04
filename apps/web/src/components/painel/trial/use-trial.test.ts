import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { TrialView } from "@/lib/billing/trial";
import { faixaDoTeste } from "@/lib/billing/trial-copy";

import { aposLeitura } from "./use-trial";

const AGORA = new Date("2026-10-04T12:00:00.000Z");
const NADA: TrialView = { elegivel: false, emTeste: null, cartaoRepetido: false };
const TRIALING: TrialView = {
  ...NADA,
  emTeste: { fim: "2026-10-11T12:00:00.000Z", plano: "Growth", precoCents: 29700, semCobranca: false },
};
const REPETIDO: TrialView = { ...NADA, cartaoRepetido: true };

/** As leituras que o hook faz depois do Checkout, até `continuar` cair. */
function voltarDoCheckout(leituras: TrialView[]) {
  const passos: Array<{ view: TrialView; ativando: boolean; continuar: boolean }> = [];
  for (const [i, view] of leituras.entries()) {
    const passo = aposLeitura(view, i + 1);
    passos.push({ view, ...passo });
    if (!passo.continuar) break;
  }
  return passos;
}

test("cartao repetido: o webhook grava trialing antes de cancelar, e a faixa termina no cartao repetido", () => {
  const passos = voltarDoCheckout([NADA, TRIALING, TRIALING, REPETIDO, REPETIDO]);
  const ultimo = passos[passos.length - 1];
  assert.equal(faixaDoTeste(ultimo.view, AGORA)?.tipo, "cartao_repetido");
  // O cartão repetido é final: para de reler ali, sem gastar o resto do orçamento.
  assert.equal(passos.length, 4);
  assert.equal(ultimo.ativando, false);
});

test("caminho feliz: o primeiro trialing ja tira o Ativando", () => {
  const passos = voltarDoCheckout([NADA, TRIALING, TRIALING]);
  assert.deepEqual(
    passos.map((p) => p.ativando),
    [true, false, false],
  );
});

test("orcamento de 10 leituras: para e solta o Ativando mesmo sem resposta", () => {
  const passos = voltarDoCheckout(Array.from({ length: 15 }, () => NADA));
  assert.equal(passos.length, 10);
  assert.equal(passos[8].ativando, true);
  assert.equal(passos[9].ativando, false);
  assert.equal(passos[9].continuar, false);
});

test("teste em andamento segue relendo ate o fim do orcamento", () => {
  const passos = voltarDoCheckout(Array.from({ length: 15 }, () => TRIALING));
  assert.equal(passos.length, 10);
  assert.ok(passos.every((p) => !p.ativando));
});
