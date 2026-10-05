import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { TrialView } from "@/lib/billing/trial";
import { faixaDoTeste } from "@/lib/billing/trial-copy";

import { aposLeitura, releAposErro } from "./use-trial";

const AGORA = new Date("2026-10-04T12:00:00.000Z");
const NADA: TrialView = { elegivel: false, emTeste: null, cartaoRepetido: false };
const TRIALING: TrialView = {
  ...NADA,
  emTeste: { fim: "2026-10-11T12:00:00.000Z", plano: "Growth", precoCents: 29700, semCobranca: false },
};
const REPETIDO: TrialView = { ...NADA, cartaoRepetido: true };
/** Leitura que falhou: resposta não-ok (um 500) ou exceção. */
const ERRO = "erro";

/**
 * As leituras que o hook faz depois do Checkout, até `continuar` cair, e o que fica na
 * tela a cada uma. Um erro não troca a `view` nem o `ativando`; se a releitura acaba
 * nele, o hook solta o "Ativando…".
 */
function voltarDoCheckout(leituras: Array<TrialView | typeof ERRO>) {
  const passos: Array<{ view: TrialView | null; ativando: boolean; continuar: boolean }> = [];
  let view: TrialView | null = null;
  let ativando = true;
  for (const [i, lida] of leituras.entries()) {
    let continuar: boolean;
    if (lida === ERRO) {
      continuar = releAposErro(true, i + 1);
      if (!continuar) ativando = false;
    } else {
      view = lida;
      ({ ativando, continuar } = aposLeitura(lida, i + 1));
    }
    passos.push({ view, ativando, continuar });
    if (!continuar) break;
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

test("um 500 no meio da releitura nao encerra a espera: o cartao repetido ainda chega", () => {
  const passos = voltarDoCheckout([TRIALING, ERRO, REPETIDO]);
  const ultimo = passos[passos.length - 1];
  assert.equal(passos.length, 3);
  assert.equal(faixaDoTeste(ultimo.view, AGORA)?.tipo, "cartao_repetido");
  assert.equal(ultimo.ativando, false);
});

test("erro antes da primeira resposta: segue relendo, com o Ativando", () => {
  const passos = voltarDoCheckout([ERRO, ERRO, TRIALING]);
  assert.deepEqual(
    passos.map((p) => [p.ativando, p.continuar]),
    [
      [true, true],
      [true, true],
      [false, true],
    ],
  );
});

test("erro gasta uma tentativa: o orcamento continua de 10 leituras", () => {
  const passos = voltarDoCheckout(Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? NADA : ERRO)));
  assert.equal(passos.length, 10);
  assert.equal(passos[9].continuar, false);
  assert.equal(passos[9].ativando, false);
});

test("fora da volta do Checkout, erro encerra como antes", () => {
  assert.equal(releAposErro(false, 1), false);
  assert.equal(releAposErro(true, 1), true);
});
