import assert from "node:assert/strict";
import { test } from "node:test";

import { abreviaNome, iniciaisDaLoja, romaneioDoPlano } from "./casca";

test("iniciaisDaLoja pega as duas primeiras palavras, em maiúscula", () => {
  assert.equal(iniciaisDaLoja("Mega Stock Atacado"), "MS");
  assert.equal(iniciaisDaLoja("  girumo  "), "G");
  assert.equal(iniciaisDaLoja(""), "•");
  assert.equal(iniciaisDaLoja(null), "•");
});

test("abreviaNome guarda só o primeiro nome e a inicial do segundo", () => {
  assert.equal(abreviaNome("Josiane Maria Silva"), "Josiane M.");
  assert.equal(abreviaNome("  josiane  "), "josiane");
  assert.equal(abreviaNome(""), "Alguém");
  assert.equal(abreviaNome(null), "Alguém");
});

test("romaneio: nome do plano em caixa alta e a data de renovação", () => {
  // Instante fixo (12:00 de Brasília em 04/10): `new Date(2026, 9, 4)` dependia
  // do fuso de quem roda o teste.
  const fim = "2026-10-04T15:00:00.000Z";
  assert.equal(romaneioDoPlano({ status: "active", current_period_end: fim, plans: { name: "Growth" } }), "GROWTH · renova 04/10");
  assert.equal(
    romaneioDoPlano({ status: "trialing", current_period_end: fim, plans: { name: "Starter" } }),
    "STARTER · teste até 04/10",
  );
  assert.equal(
    romaneioDoPlano({ status: "active", cancel_at_period_end: true, current_period_end: fim, plans: { name: "Pro" } }),
    "PRO · até 04/10",
  );
  assert.equal(romaneioDoPlano({ status: "active", current_period_end: null, plans: { name: "Pro" } }), "PRO");
  assert.equal(romaneioDoPlano(null), "SEM PLANO · escolher");
});

test("romaneio: data no fuso de Brasília, não no do navegador", () => {
  // 22:30 de 04/10 em Brasília já é 05/10 em UTC: com `getDate()` o rodapé dizia
  // "05/10" a quem roda em UTC, um dia depois de Configurações e da faixa.
  const quaseMeiaNoite = "2026-10-05T01:30:00.000Z";
  assert.equal(
    romaneioDoPlano({ status: "active", current_period_end: quaseMeiaNoite, plans: { name: "Growth" } }),
    "GROWTH · renova 04/10",
  );
});

test("romaneio: assinatura cancelada não renova nem concede plano", () => {
  // O teste com cartão repetido termina `canceled` com o plano ainda apontado: o
  // rodapé dizia "GROWTH · renova DD/MM" enquanto a faixa dizia "Não cobramos nada"
  // e Configurações, "Inativa". Cancelada é o mesmo acesso de quem não tem plano.
  const fim = "2026-10-10T15:00:00.000Z";
  assert.equal(
    romaneioDoPlano({ status: "canceled", current_period_end: fim, plans: { name: "Growth" } }),
    "SEM PLANO · escolher",
  );
  assert.equal(
    romaneioDoPlano({ status: "canceled", current_period_end: null, plans: { name: "Growth" } }),
    "SEM PLANO · escolher",
  );
});
