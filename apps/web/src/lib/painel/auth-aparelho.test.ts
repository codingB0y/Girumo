import assert from "node:assert/strict";
import { test } from "node:test";

import { apelidoDoEmail, estadoDaPorta, lerAparelho, pareceEmail } from "./auth-aparelho";

test("aceita e-mail comum e recusa o que nem parece", () => {
  assert.equal(pareceEmail("igor@megastock.com.br"), true);
  assert.equal(pareceEmail("igor+lista@loja.com"), true);
  assert.equal(pareceEmail(""), false);
  assert.equal(pareceEmail("igor"), false);
  assert.equal(pareceEmail("igor@loja"), false, "domínio sem ponto não é e-mail");
  assert.equal(pareceEmail("igor@@loja.com"), false);
  assert.equal(pareceEmail("@loja.com"), false);
  assert.equal(pareceEmail("igor@.com"), false);
  assert.equal(pareceEmail("igor@loja."), false);
});

test("e-mail com espaço não passa — é colagem torta, não endereço", () => {
  assert.equal(pareceEmail("igor @loja.com"), false);
  assert.equal(pareceEmail("igor@loja.com\n"), false);
});

test("e-mail absurdamente longo não vira tela", () => {
  assert.equal(pareceEmail(`${"a".repeat(250)}@loja.com`), false);
});

test("lê o que foi guardado, normalizado", () => {
  assert.deepEqual(lerAparelho('{"email":"  IGOR@Loja.com.BR "}'), { email: "igor@loja.com.br" });
});

test("storage vazio, sujo ou adulterado devolve null em vez de estourar", () => {
  assert.equal(lerAparelho(null), null);
  assert.equal(lerAparelho(""), null);
  assert.equal(lerAparelho("não é json"), null);
  assert.equal(lerAparelho("[]"), null);
  assert.equal(lerAparelho("null"), null);
  assert.equal(lerAparelho('{"email":123}'), null);
  assert.equal(lerAparelho('{"outra":"coisa"}'), null);
  assert.equal(lerAparelho('{"email":"lixo"}'), null, "e-mail inválido no storage não vira sessão lembrada");
});

test("sem aparelho a porta trata como visitante", () => {
  assert.deepEqual(estadoDaPorta(null), { tipo: "visitante" });
});

test("com aparelho a porta abre no e-mail de quem já entrou", () => {
  assert.deepEqual(estadoDaPorta({ email: "igor@loja.com.br" }), { tipo: "lembrado", email: "igor@loja.com.br" });
});

test("apelido é o pedaço antes do arroba", () => {
  assert.equal(apelidoDoEmail("igor@megastock.com.br"), "igor");
  assert.equal(apelidoDoEmail("sem-arroba"), "sem-arroba");
});
