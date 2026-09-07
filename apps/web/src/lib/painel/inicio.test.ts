import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cabecalhoDoDia,
  diaHoraCurto,
  diasRestantesNoMes,
  iniciais,
  linhaDoDia,
  marcasDaFita,
  resumoDoEstoque,
  rotulosDaFita,
  vagasDaCampanha,
} from "./inicio";

const sexta = new Date(2026, 8, 4, 15, 0); // sexta, 04/09/2026

test("cabeçalho do dia nas duas larguras", () => {
  assert.deepEqual(cabecalhoDoDia(sexta), { titulo: "Sexta, 04 de setembro", tituloCurto: "Sex, 04 de setembro" });
});

test("linha do dia conta entradas e o último post; sem post, diz que não houve", () => {
  const post = new Date(2026, 8, 2, 12, 12).toISOString();
  assert.equal(linhaDoDia({ hoje: 0, semana: 4, ultimoPost: post }, sexta), "0 entradas hoje · 4 na semana · último post qua 12:12");
  assert.equal(linhaDoDia({ hoje: 1, semana: 1, ultimoPost: null }, sexta), "1 entrada hoje · 1 na semana · nenhum post ainda");
});

test("dia e hora curtos: dia da semana na semana corrente, data depois", () => {
  assert.equal(diaHoraCurto(new Date(2026, 8, 2, 14, 20).toISOString(), sexta), "qua 14:20");
  assert.equal(diaHoraCurto(new Date(2026, 7, 20, 9, 0).toISOString(), sexta), "20/08");
  assert.equal(diaHoraCurto("não é data", sexta), "");
});

test("dias restantes no mês: 04/09 → 26; último dia → 0", () => {
  assert.equal(diasRestantesNoMes(sexta), 26);
  assert.equal(diasRestantesNoMes(new Date(2026, 8, 30)), 0);
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

test("resumo do estoque soma pessoas e vagas e acha o grupo quase cheio", () => {
  const r = resumoDoEstoque(grupos);
  assert.equal(r.grupos, 3);
  assert.equal(r.pessoas, 1512);
  assert.equal(r.vagas, 3072 - 1512);
  assert.equal(r.quaseCheio?.name, "B");
  assert.equal(resumoDoEstoque([grupos[0]]).quaseCheio, null);
});
