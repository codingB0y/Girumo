import assert from "node:assert/strict";
import { test } from "node:test";
import { campanhasParaConvite, consultaDaBarra, filtrarRespostas, moverAtivo, type RespostaPronta } from "./campo";

const R = (id: string, titulo: string): RespostaPronta => ({ id, titulo, texto: `texto ${id}` });
const LISTA = [R("1", "Prazo de envio"), R("2", "Troca e devolução"), R("3", "Preço")];

test("a barra só abre com / no começo; o resto vira a consulta", () => {
  assert.equal(consultaDaBarra("/"), "");
  assert.equal(consultaDaBarra("/pra"), "pra");
  assert.equal(consultaDaBarra("/prazo de"), "prazo de");
  assert.equal(consultaDaBarra("oi /prazo"), null);
  assert.equal(consultaDaBarra(" /prazo"), null);
  assert.equal(consultaDaBarra(""), null);
});

test("quebra de linha fecha a lista: já virou uma mensagem", () => {
  assert.equal(consultaDaBarra("/prazo\nobrigada"), null);
});

test("o filtro ignora caixa e acento e olha só o título", () => {
  assert.deepEqual(filtrarRespostas(LISTA, "preco").map((r) => r.id), ["3"]);
  assert.deepEqual(filtrarRespostas(LISTA, "DEVOLUCAO").map((r) => r.id), ["2"]);
  assert.deepEqual(filtrarRespostas(LISTA, "texto 1"), [], "o corpo da resposta não conta");
  assert.deepEqual(filtrarRespostas(LISTA, "").map((r) => r.id), ["1", "2", "3"]);
  assert.deepEqual(filtrarRespostas(LISTA, "  e  ").map((r) => r.id), ["1", "2", "3"], "espaços nas pontas não contam");
});

test("setas dão a volta e lista vazia fica em -1", () => {
  assert.equal(moverAtivo(0, "ArrowDown", 3), 1);
  assert.equal(moverAtivo(2, "ArrowDown", 3), 0);
  assert.equal(moverAtivo(0, "ArrowUp", 3), 2);
  assert.equal(moverAtivo(1, "ArrowUp", 3), 0);
  assert.equal(moverAtivo(0, "ArrowDown", 0), -1);
  assert.equal(moverAtivo(5, "ArrowDown", 3), 0, "índice fora da lista (ela encolheu) recomeça");
});

test("o convite oferece as campanhas com link; sem nome usa o link; entrada torta some", () => {
  assert.deepEqual(campanhasParaConvite([{ id: "a", slug: "vip", name: "VIP" }, { id: "b", slug: "x" }, { id: "c", name: "Sem link" }, { id: "d", slug: "" }, null, 7, { slug: "y" }]), [
    { id: "a", nome: "VIP" },
    { id: "b", nome: "x" },
  ]);
  assert.deepEqual(campanhasParaConvite({ erro: true }), []);
});
