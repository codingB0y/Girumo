import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildFirstTouch,
  isSearchEngine,
  parseFirstTouch,
  serializeFirstTouch,
} from "./first-touch";

const HOME = "https://www.girumo.com.br/";

test("acesso direto sem utm não grava nada", () => {
  // Gravar "não sei" ocuparia a vaga e impediria uma visita futura COM origem
  // de ser registrada.
  assert.equal(buildFirstTouch({ url: HOME, referrer: "" }), null);
});

test("referrer de buscador vira origem orgânica", () => {
  const touch = buildFirstTouch({ url: HOME, referrer: "https://www.google.com/search?q=girumo" });

  assert.equal(touch?.s, "www.google.com");
  assert.equal(touch?.m, "organic");
  assert.equal(touch?.p, "/");
});

test("referrer de site comum vira referral, não orgânico", () => {
  const touch = buildFirstTouch({ url: HOME, referrer: "https://algumblog.com.br/post" });

  assert.equal(touch?.s, "algumblog.com.br");
  assert.equal(touch?.m, "referral");
});

test("utm explícito ganha do referrer", () => {
  const touch = buildFirstTouch({
    url: "https://www.girumo.com.br/precos?utm_source=newsletter&utm_medium=email&utm_campaign=lancamento",
    referrer: "https://www.google.com/",
  });

  assert.equal(touch?.s, "newsletter");
  assert.equal(touch?.m, "email");
  assert.equal(touch?.c, "lancamento");
  assert.equal(touch?.p, "/precos?utm_source=newsletter&utm_medium=email&utm_campaign=lancamento");
});

test("referrer interno é descartado — navegação nossa não é origem", () => {
  // Sem isto, "girumo.com.br" vira o canal campeão do relatório.
  assert.equal(buildFirstTouch({ url: HOME, referrer: "https://www.girumo.com.br/precos" }), null);
});

test("reconhece os buscadores e ignora domínio parecido", () => {
  assert.equal(isSearchEngine("www.google.com"), true);
  assert.equal(isSearchEngine("duckduckgo.com"), true);
  assert.equal(isSearchEngine("meublog.com"), false);
  // "googlecoisas.com" não é o Google.
  assert.equal(isSearchEngine("googlecoisas.com"), false);
});

test("serializa e relê preservando o conteúdo", () => {
  const touch = buildFirstTouch({ url: HOME, referrer: "https://www.google.com/" });
  assert.ok(touch);
  const serialized = serializeFirstTouch(touch);
  assert.ok(serialized);
  assert.deepEqual(parseFirstTouch(serialized), touch);
});

test("cookie corrompido devolve null em vez de lançar", () => {
  // O valor vem do browser e pode ter sido editado à mão. Um signup não pode
  // falhar porque a atribuição veio quebrada.
  assert.equal(parseFirstTouch("não é json"), null);
  assert.equal(parseFirstTouch("%7Bquebrado"), null);
  assert.equal(parseFirstTouch(""), null);
  assert.equal(parseFirstTouch(null), null);
  assert.equal(parseFirstTouch(encodeURIComponent('{"s":"x"}')), null, "sem `p` não é um first touch");
});

test("url inválida não derruba a montagem", () => {
  assert.equal(buildFirstTouch({ url: "nao-e-url", referrer: "https://www.google.com/" }), null);
});
