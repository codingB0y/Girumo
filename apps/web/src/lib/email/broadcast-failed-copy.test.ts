import { test } from "node:test";
import assert from "node:assert/strict";
import { broadcastFailedCopy, broadcastFailedTitle } from "./broadcast-failed-copy";

test("um envio falho fala no singular", () => {
  const c = broadcastFailedCopy("Igor Toledo", ["Promo de sexta"]);
  assert.equal(c.subject, "Sua mensagem não chegou nos grupos");
  assert.equal(c.headline, "Uma mensagem não saiu");
  assert.equal(c.lista, "Promo de sexta");
});

test("vários envios falhos falam no plural e contam", () => {
  const c = broadcastFailedCopy("Igor", ["A", "B"]);
  assert.equal(c.subject, "2 mensagens não chegaram nos seus grupos");
  assert.equal(c.headline, "2 mensagens não saíram");
  assert.equal(c.lista, "A, B");
});

test("o texto do lojista não usa o termo aposentado", () => {
  // "disparo" é vocabulário interno (entidade broadcast, rota /painel/disparos).
  // O guard-rail de marca cobre templates.ts; este módulo fica fora do alcance
  // dele, então a regra precisa de um teste próprio — senão o termo volta por aqui.
  const c = broadcastFailedCopy("Igor", ["A", "B"]);
  for (const texto of [c.subject, c.headline, broadcastFailedTitle(1), broadcastFailedTitle(3)]) {
    assert.doesNotMatch(texto, /disparos?/i, texto);
  }
});

test("lista no máximo 3 nomes e resume o resto", () => {
  // Sem o corte, um tenant com 40 disparos falhos geraria um parágrafo ilegível.
  const c = broadcastFailedCopy("Igor", ["A", "B", "C", "D", "E"]);
  assert.equal(c.lista, "A, B, C e mais 2");
});

test("exatamente 3 nomes não ganha sufixo", () => {
  // Limite: "e mais 0" seria um bug visível na caixa de entrada.
  const c = broadcastFailedCopy("Igor", ["A", "B", "C"]);
  assert.equal(c.lista, "A, B, C");
});

test("usa só o primeiro nome, e cai pra 'lojista' quando não tem nome", () => {
  assert.equal(broadcastFailedCopy("Igor Toledo Silva", ["X"]).firstName, "Igor");
  assert.equal(broadcastFailedCopy("", ["X"]).firstName, "lojista");
});

test("o título do feed segue a mesma regra de plural do e-mail", () => {
  assert.equal(broadcastFailedTitle(1), "Uma mensagem não saiu");
  assert.equal(broadcastFailedTitle(4), "4 mensagens não saíram");
});
