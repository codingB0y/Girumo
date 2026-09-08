import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cenaDasAutomacoes,
  chipDoPasso,
  comEnabled,
  esperaEmPalavras,
  reinserirNaPosicao,
  resumoDaAutomacao,
  visiveisParaOLojista,
} from "./automacoes";

test("gatilho de lifecycle do SaaS nunca chega à tela do lojista", () => {
  // Mutante: soltar o filtro (ou negar a condição). TRIGGER_LABELS não tem
  // rótulo para esses dois, então o vazamento não mostra "um item a mais":
  // mostra o slug cru "trial_ending" na cara de quem paga. Decisão P0.7.
  const lista = [
    { id: "1", trigger: "lead_entered" },
    { id: "2", trigger: "trial_ending" },
    { id: "3", trigger: "no_connect_24h" },
    { id: "4", trigger: "group_full" },
  ];
  assert.deepEqual(
    visiveisParaOLojista(lista).map((a) => a.id),
    ["1", "4"],
  );
  assert.deepEqual(visiveisParaOLojista([]), []);
});

test("carregando ganha de vazio; erro é cena própria", () => {
  assert.equal(cenaDasAutomacoes({ carga: "carregando", total: 0 }), "carregando");
  assert.equal(cenaDasAutomacoes({ carga: "carregando", total: 3 }), "carregando");
  assert.equal(cenaDasAutomacoes({ carga: "erro", total: 0 }), "erro");
  assert.equal(cenaDasAutomacoes({ carga: "ok", total: 0 }), "vazio");
  assert.equal(cenaDasAutomacoes({ carga: "ok", total: 1 }), "lista");
});

test("espera em palavras vira português nas quatro faixas", () => {
  // Mutante: trocar `<` por `<=` nas fronteiras joga 60 min em "60 min" e
  // 1440 em "24 h". As bordas são exatamente onde a unidade deve virar.
  assert.equal(esperaEmPalavras(0), "Imediato");
  assert.equal(esperaEmPalavras(5), "5 min");
  assert.equal(esperaEmPalavras(59), "59 min");
  assert.equal(esperaEmPalavras(60), "1 h");
  assert.equal(esperaEmPalavras(1439), "24 h");
  assert.equal(esperaEmPalavras(1440), "1 dia");
  assert.equal(esperaEmPalavras(4320), "3 dias");
});

test("espera negativa não vira '-5 min'", () => {
  assert.equal(esperaEmPalavras(-5), "Imediato");
});

test("resumo concorda com singular e plural", () => {
  assert.equal(
    resumoDaAutomacao({ steps: [1, 2], total_runs: 12 }, "Grupo lotou"),
    "Grupo lotou · 2 passos · 12 execuções",
  );
  assert.equal(
    resumoDaAutomacao({ steps: [1], total_runs: 1 }, "Toda semana"),
    "Toda semana · 1 passo · 1 execução",
  );
  assert.equal(
    resumoDaAutomacao({ steps: [], total_runs: 0 }, "Grupo parado"),
    "Grupo parado · 0 passos · 0 execuções",
  );
  // Milhar em pt-BR, não "1234 execuções".
  assert.match(resumoDaAutomacao({ steps: [1], total_runs: 1234 }, "X"), /1\.234 execuções/);
});

test("chip do passo: mensagem tem nome, espera tem duração", () => {
  assert.deepEqual(chipDoPasso({ type: "message", delay_minutes: 90 }), {
    texto: "Mensagem",
    mensagem: true,
  });
  // Mutante: usar o delay do passo de mensagem mostraria "1 h 30" no chip de
  // uma mensagem imediata — o delay dela existe e é ignorado de propósito.
  assert.deepEqual(chipDoPasso({ type: "wait", delay_minutes: 90 }), {
    texto: "2 h",
    mensagem: false,
  });
  assert.deepEqual(chipDoPasso({ type: "condition", delay_minutes: 0 }), {
    texto: "Imediato",
    mensagem: false,
  });
});

test("alternar 'ligada' não encosta nas outras linhas", () => {
  // Mutante: reverter com um retrato inteiro da lista engoliria a alternância
  // que a lojista fez em OUTRA linha enquanto esta estava em voo.
  const lista = [
    { id: "a", enabled: true },
    { id: "b", enabled: false },
  ];
  const depois = comEnabled(lista, "b", true);
  assert.deepEqual(depois, [
    { id: "a", enabled: true },
    { id: "b", enabled: true },
  ]);
  // O original fica intacto e a linha não tocada mantém a MESMA referência.
  assert.equal(lista[1].enabled, false);
  assert.equal(depois[0], lista[0]);
});

test("id que não existe não inventa linha", () => {
  const lista = [{ id: "a", enabled: true }];
  assert.deepEqual(comEnabled(lista, "z", false), [{ id: "a", enabled: true }]);
});

test("DELETE recusado devolve a automação à posição original", () => {
  const lista = [{ id: "a" }, { id: "c" }];
  assert.deepEqual(reinserirNaPosicao(lista, { id: "b" }, 1), [{ id: "a" }, { id: "b" }, { id: "c" }]);
  // Índice além do fim entra no fim, em vez de sumir.
  assert.deepEqual(reinserirNaPosicao(lista, { id: "z" }, 99), [{ id: "a" }, { id: "c" }, { id: "z" }]);
});

test("reinserir item que já voltou devolve a MESMA lista", () => {
  // Mutante: sem a guarda, uma recarga que chegou antes do rollback produz
  // linha duplicada com a mesma key — React reclama e a lojista vê duas.
  const lista = [{ id: "a" }, { id: "b" }];
  const depois = reinserirNaPosicao(lista, { id: "b" }, 0);
  assert.equal(depois, lista);
});
