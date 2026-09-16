import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sugerirCobertura, ALVO_COBERTURA } from "./cobertura";

const grupo = (id: string, name = id): { whatsappGroupId: string; name: string } => ({ whatsappGroupId: id, name });
const pessoa = (grupoId: string, lid: string) => ({ whatsappGroupId: grupoId, participantLid: lid });

test("grupo unico com todo mundo cobre 100%", () => {
  const r = sugerirCobertura([grupo("g1")], [pessoa("g1", "a"), pessoa("g1", "b")]);
  assert.equal(r.pessoasTotais, 2);
  assert.equal(r.pessoasCobertas, 2);
  assert.equal(r.cobertura, 1);
  assert.deepEqual(r.grupos.map((g) => g.whatsappGroupId), ["g1"]);
});

test("escolhe o grupo com mais gente nova primeiro (guloso)", () => {
  // g1 tem 3 pessoas exclusivas, g2 tem 1 pessoa (que tambem esta em g1).
  const participantes = [pessoa("g1", "a"), pessoa("g1", "b"), pessoa("g1", "c"), pessoa("g2", "a")];
  const r = sugerirCobertura([grupo("g2"), grupo("g1")], participantes, 1);
  assert.equal(r.grupos[0]?.whatsappGroupId, "g1");
  assert.equal(r.grupos[0]?.pessoasNovas, 3);
});

test("para assim que bate o alvo, nao inclui todo mundo", () => {
  const participantes = [
    pessoa("g1", "a"), pessoa("g1", "b"), pessoa("g1", "c"), pessoa("g1", "d"),
    pessoa("g2", "e"),
  ];
  // g1 sozinho cobre 4 de 5 = 80%; alvo 70% deve parar em g1, sem precisar de g2.
  const r = sugerirCobertura([grupo("g1"), grupo("g2")], participantes, 0.7);
  assert.deepEqual(r.grupos.map((g) => g.whatsappGroupId), ["g1"]);
  assert.equal(r.pessoasCobertas, 4);
});

test("sem participante nenhum, cobertura e 0 e nao divide por zero", () => {
  const r = sugerirCobertura([grupo("g1")], []);
  assert.equal(r.pessoasTotais, 0);
  assert.equal(r.cobertura, 0);
  assert.deepEqual(r.grupos, []);
});

test("sem grupo nenhum, devolve vazio mesmo com participantes orfaos", () => {
  const r = sugerirCobertura([], [pessoa("g1", "a")]);
  assert.deepEqual(r.grupos, []);
  assert.equal(r.pessoasTotais, 0);
});

test("alvo default e 95%", () => {
  assert.equal(ALVO_COBERTURA, 0.95);
});

test("pessoa em dois grupos do corte so conta uma vez em pessoasCobertas", () => {
  const participantes = [pessoa("g1", "a"), pessoa("g2", "a"), pessoa("g2", "b")];
  const r = sugerirCobertura([grupo("g1"), grupo("g2")], participantes, 1);
  assert.equal(r.pessoasCobertas, 2);
  assert.equal(r.pessoasTotais, 2);
});
