import assert from "node:assert/strict";
import { test } from "node:test";

import { abreviaNome, romaneioDoPlano, textoDoTicker } from "./casca";

const agora = new Date(2026, 8, 2, 12, 30); // qua 02/09/2026 12:30

test("abreviaNome guarda só o primeiro nome e a inicial do segundo", () => {
  assert.equal(abreviaNome("Josiane Maria Silva"), "Josiane M.");
  assert.equal(abreviaNome("  josiane  "), "josiane");
  assert.equal(abreviaNome(""), "Alguém");
  assert.equal(abreviaNome(null), "Alguém");
});

test("entrada nas últimas 24h vira o ticker, com nome abreviado e grupo", () => {
  const ha2min = new Date(agora.getTime() - 2 * 60_000).toISOString();
  const t = textoDoTicker({ nome: "Josiane Maria", grupo: "Mega Stock Atacado #109", quando: ha2min }, null, agora);
  assert.deepEqual(t, { tipo: "entrada", texto: "Josiane M. entrou no Mega Stock Atacado #109 · há 2 min" });
});

test("entrada sem nome nem grupo ainda é uma entrada", () => {
  const ha1h = new Date(agora.getTime() - 60 * 60_000).toISOString();
  assert.equal(textoDoTicker({ quando: ha1h }, null, agora).texto, "Alguém entrou num grupo · há 1 h");
});

test("sem entrada em 24h, mostra o último post com dia da semana e grupos", () => {
  const ha2dias = new Date(agora.getTime() - 2 * 24 * 60 * 60_000).toISOString();
  const post = { quando: new Date(2026, 8, 2, 12, 12).toISOString(), enviados: 13, total: 13 };
  const t = textoDoTicker({ nome: "Ana", quando: ha2dias }, post, agora);
  assert.deepEqual(t, { tipo: "post", texto: "Último post qua 12:12 · 13/13 grupos" });
});

test("sem entrada nem post, aponta o próximo passo em vez de zero", () => {
  const t = textoDoTicker(null, null, agora);
  assert.equal(t.tipo, "vazio");
  assert.match(t.texto, /compartilhe o convite/);
  assert.doesNotMatch(t.texto, /\b0\b/);
});

test("romaneio: nome do plano em caixa alta e a data de renovação", () => {
  const fim = new Date(2026, 9, 4).toISOString();
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
