import assert from "node:assert/strict";
import { test } from "node:test";
import type { Barra } from "./atividade";
import { fraseDoMovimento, medindoDesde, saldo } from "./atividade-texto";

function barra(parcial: Partial<Barra>): Barra {
  return {
    chave: "x",
    rotulo: "",
    rotuloLongo: "",
    valor: 0,
    abaixo: 0,
    futuro: false,
    atual: false,
    semMedicao: false,
    ...parcial,
  };
}

test("saldo uses the typographic minus and thousands separator", () => {
  assert.equal(saldo(29), "+29");
  assert.equal(saldo(-3), "−3");
  assert.equal(saldo(0), "0");
  assert.equal(saldo(1500), "+1.500");
});

test("medindoDesde shows the hour only when measuring started mid-day", () => {
  assert.equal(medindoDesde("2026-10-01T03:00:00.000Z"), "medindo desde 01/10");
  assert.equal(medindoDesde("2026-10-01T02:01:58.000Z"), "medindo desde 30/09, 23h");
});

test("fraseDoMovimento says so when nothing in the period was measured", () => {
  const barras = [barra({ semMedicao: true }), barra({ semMedicao: true })];
  assert.equal(
    fraseDoMovimento(barras, { entraram: 0, sairam: 0 }, "hoje", "medindo desde 30/09, 23h"),
    "Entradas e saídas ainda não eram medidas neste período (medindo desde 30/09, 23h).",
  );
});

test("fraseDoMovimento with no movement", () => {
  const barras = [barra({}), barra({})];
  assert.equal(fraseDoMovimento(barras, { entraram: 0, sairam: 0 }, "hoje", null), "Ninguém entrou nem saiu hoje.");
});

test("fraseDoMovimento with movement names the peak, and `onde` goes right after `quando`", () => {
  const barras = [barra({ valor: 5, abaixo: 1, rotuloLongo: "12h às 12h59" }), barra({ valor: 0, abaixo: 2 })];
  const m = { entraram: 5, sairam: 3 };
  assert.equal(fraseDoMovimento(barras, m, "hoje", null), "5 entraram e 3 saíram hoje; saldo +2. O pico foi 12h às 12h59, com 5.");
  assert.equal(
    fraseDoMovimento(barras, m, "hoje", null, "nos grupos da loja"),
    "5 entraram e 3 saíram hoje nos grupos da loja; saldo +2. O pico foi 12h às 12h59, com 5.",
  );
});

test("fraseDoMovimento puts `onde` before the measurement note and in the empty phrase", () => {
  const barras = [barra({ semMedicao: true }), barra({ valor: 1, rotuloLongo: "10h às 10h59" })];
  assert.equal(
    fraseDoMovimento(barras, { entraram: 1, sairam: 0 }, "hoje", "medindo desde 01/10", "nos grupos da loja"),
    "1 entrou e 0 saíram hoje nos grupos da loja (medindo desde 01/10); saldo +1. O pico foi 10h às 10h59, com 1.",
  );
  assert.equal(
    fraseDoMovimento([barra({})], { entraram: 0, sairam: 0 }, "hoje", null, "nos grupos da loja"),
    "Ninguém entrou nem saiu hoje nos grupos da loja.",
  );
});
