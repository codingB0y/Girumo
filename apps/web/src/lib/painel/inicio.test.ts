import assert from "node:assert/strict";
import { test } from "node:test";

import { diaHoraCurto, iniciais, marcasDaFita, rotulosDaFita, vagasDaCampanha } from "./inicio";

const sexta = new Date(2026, 8, 4, 15, 0); // sexta, 04/09/2026

test("dia e hora curtos: dia da semana na semana corrente, data depois", () => {
  assert.equal(diaHoraCurto(new Date(2026, 8, 2, 14, 20).toISOString(), sexta), "qua 14:20");
  assert.equal(diaHoraCurto(new Date(2026, 7, 20, 9, 0).toISOString(), sexta), "20/08");
  assert.equal(diaHoraCurto("não é data", sexta), "");
});

test("rótulos da fita a cada quinto da meta", () => {
  assert.deepEqual(
    rotulosDaFita(50_000).map((r) => r.texto),
    ["R$ 10 mil", "20", "30", "40", "50 mil"],
  );
  assert.deepEqual(rotulosDaFita(12_500).map((r) => r.texto), ["R$ 2,5 mil", "5", "7,5", "10", "12,5 mil"]);
  assert.deepEqual(rotulosDaFita(50_000).map((r) => r.posicao), [20, 40, 60, 80, 100]);
});

test("marcas da fita: uma a cada passo, nunca zero", () => {
  assert.equal(marcasDaFita(50_000, 5_000), 10);
  assert.equal(marcasDaFita(3_000, 5_000), 1);
  assert.equal(marcasDaFita(0, 5_000), 1);
});

test("iniciais: duas letras, sem nome vira ponto", () => {
  assert.equal(iniciais("Josiane Moura"), "JM");
  assert.equal(iniciais("ana"), "A");
  assert.equal(iniciais(""), "•");
});

const grupos = [
  { id: "u1", whatsappGroupId: "w1@g.us", name: "A", members: 500, capacity: 1024 },
  { id: "u2", whatsappGroupId: "w2@g.us", name: "B", members: 1012, capacity: 1024 },
  { id: "u3", whatsappGroupId: "w3@g.us", name: "C", members: 0, capacity: 1024 },
];

test("vagas da campanha casam por whatsapp id ou por uuid", () => {
  assert.deepEqual(vagasDaCampanha(["w1@g.us", "u3"], grupos), { pessoas: 500, capacidade: 2048, lotacao: 500 / 2048 });
  assert.deepEqual(vagasDaCampanha([], grupos), { pessoas: 0, capacidade: 0, lotacao: 0 });
});
