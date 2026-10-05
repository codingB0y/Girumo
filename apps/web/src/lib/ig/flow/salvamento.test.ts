import test from "node:test";
import assert from "node:assert/strict";
import { atrasoDoSalvamento, resultadoDaPublicacao, textoDoSalvamento, valeTentarDeNovo } from "./salvamento";

test("pendente e salvando dizem a mesma coisa pra pessoa", () => {
  assert.equal(textoDoSalvamento("pendente"), textoDoSalvamento("salvando"));
  assert.equal(textoDoSalvamento("salvo"), "Salvo");
  assert.match(textoDoSalvamento("erro"), /Não salvou/);
  assert.match(textoDoSalvamento("falhou"), /Não deu pra salvar/);
});

test("só rede e 5xx tentam de novo; 4xx para", () => {
  for (const s of [0, 500, 502, 503]) assert.equal(valeTentarDeNovo(s), true, String(s));
  for (const s of [400, 401, 403, 404, 409, 422]) assert.equal(valeTentarDeNovo(s), false, String(s));
});

test("o atraso dobra e tem teto", () => {
  assert.equal(atrasoDoSalvamento(0), 800);
  assert.equal(atrasoDoSalvamento(2), 3200);
  assert.equal(atrasoDoSalvamento(99), atrasoDoSalvamento(4));
});

test("409 com issues vira pendências", () => {
  const issues = [{ code: "sem_gatilho", nodeId: null, text: "x" }];
  assert.deepEqual(resultadoDaPublicacao(409, JSON.stringify({ issues })), { tipo: "issues", issues });
});

test("409 de versão não vira pendência", () => {
  const r = resultadoDaPublicacao(409, JSON.stringify({ error: "O fluxo mudou em outra aba." }));
  assert.deepEqual(r, { tipo: "erro", mensagem: "O fluxo mudou em outra aba." });
});

test("403 em texto puro, 404, 500 e corpo vazio viram erro com mensagem", () => {
  assert.equal(resultadoDaPublicacao(403, "Forbidden").tipo, "erro");
  assert.deepEqual(resultadoDaPublicacao(404, JSON.stringify({ error: "Fluxo não encontrado." })), { tipo: "erro", mensagem: "Fluxo não encontrado." });
  assert.match((resultadoDaPublicacao(500, "") as { mensagem: string }).mensagem, /Não deu pra publicar/);
  assert.equal(resultadoDaPublicacao(409, "[]").tipo, "erro");
});

test("2xx é ok", () => {
  assert.deepEqual(resultadoDaPublicacao(200, "{}"), { tipo: "ok" });
});
