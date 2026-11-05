import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicarResposta, assinaturaDeEnvio, campanhasParaConvite, chaveParaAssinatura, semAssinatura, consultaDaBarra, filtrarRespostas, moverAtivo, type RespostaPronta } from "./campo";

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

test("a assinatura muda com o tipo e com cada parte do conteúdo", () => {
  const base = assinaturaDeEnvio("texto", { texto: "oi" });
  assert.equal(base, assinaturaDeEnvio("texto", { texto: "oi" }));
  for (const outra of [assinaturaDeEnvio("midia", { texto: "oi" }), assinaturaDeEnvio("texto", { texto: "oi!" }), assinaturaDeEnvio("midia", { texto: "oi", midiaId: "m" }), assinaturaDeEnvio("convite", { campanhaId: "c" })]) assert.notEqual(base, outra);
  assert.notEqual(assinaturaDeEnvio("texto", { texto: "a", midiaId: "b" }), assinaturaDeEnvio("texto", { texto: "", midiaId: "ab" }), "sem colisão por concatenação");
});

test("chaves por assinatura: repete a do mesmo conteúdo, gera outra para conteúdo novo e não perde as antigas", () => {
  let n = 0;
  const gerar = () => `k${++n}`;
  const a = chaveParaAssinatura(new Map(), "texto", gerar);
  const b = chaveParaAssinatura(a.mapa, "convite", gerar);
  const c = chaveParaAssinatura(b.mapa, "texto", gerar);
  assert.deepEqual([a.chave, b.chave, c.chave], ["k1", "k2", "k1"], "o convite não apagou a chave do texto que falhou");
  assert.equal(n, 2);
  assert.deepEqual([...semAssinatura(c.mapa, "texto").keys()], ["convite"]);
  assert.equal(a.mapa.size, 1, "o mapa antigo não muda");
});

test("resposta pronta: aberta pela barra troca o /pedido; pelo botão entra no cursor sem perder o rascunho", () => {
  assert.equal(aplicarResposta("/ofe", "Oferta X", true, 4, 4, 1000), "Oferta X");
  assert.equal(aplicarResposta("Oi Ana,", "Oferta X", false, 7, 7, 1000), "Oi Ana, Oferta X");
  assert.equal(aplicarResposta("Oi Ana, tchau", "Oferta X", false, 8, 8, 1000), "Oi Ana, Oferta X tchau");
  assert.equal(aplicarResposta("Oi ", "Oferta X", false, 3, 3, 1000), "Oi Oferta X");
  assert.equal(aplicarResposta("", "Oferta X", false, 0, 0, 1000), "Oferta X");
  assert.equal(aplicarResposta("abc XYZ def", "R", false, 4, 7, 1000), "abc R def", "a seleção é substituída");
  assert.equal(aplicarResposta("oi", "x".repeat(50), false, 99, 99, 10), "oi xxxxxxx", "cursor fora e limite");
});
