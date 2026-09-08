import assert from "node:assert/strict";
import { test } from "node:test";

import {
  limpaDepoisDeSalvar,
  mensagemDeSucesso,
  motivoDoBloqueio,
  podeSalvarCampo,
} from "./conta";

test("campo vazio desliga o botão nos TRÊS, não só na senha", () => {
  // Mutante: manter o gate da casca antiga (`length > 0 && length < 6`), que
  // só olhava a senha curta. Com o campo vazio o botão ficava aceso e o
  // clique caía num `if (!value.trim()) return` mudo — o lojista clica, não
  // vê erro nenhum e conclui que salvou.
  assert.equal(podeSalvarCampo("name", ""), false);
  assert.equal(podeSalvarCampo("email", "   "), false);
  assert.equal(podeSalvarCampo("password", ""), false);
});

test("senha exige 6; nome e e-mail aceitam qualquer conteúdo", () => {
  assert.equal(podeSalvarCampo("password", "12345"), false);
  assert.equal(podeSalvarCampo("password", "123456"), true);
  // Mutante: `>` no lugar de `>=` recusa a senha de exatamente 6, que é o
  // mínimo que o Supabase aceita.
  assert.equal(podeSalvarCampo("name", "A"), true);
  assert.equal(podeSalvarCampo("email", "a@b.co"), true);
});

test("espaço em volta não conta como conteúdo", () => {
  assert.equal(podeSalvarCampo("password", "  12345  "), false);
  assert.equal(podeSalvarCampo("name", "  Ana  "), true);
});

test("campo intocado não acusa erro; senha curta explica", () => {
  // Mutante: devolver o motivo também para o campo vazio pinta de vermelho um
  // formulário que a lojista nem começou a preencher.
  assert.equal(motivoDoBloqueio("password", ""), null);
  assert.equal(motivoDoBloqueio("name", ""), null);
  assert.equal(motivoDoBloqueio("password", "123"), "A senha precisa de pelo menos 6 caracteres.");
  assert.equal(motivoDoBloqueio("password", "123456"), null);
  assert.equal(motivoDoBloqueio("name", "Ana"), null);
});

test("o e-mail avisa que o trabalho não acabou no clique", () => {
  // Mutante: uma mensagem só para os três. O e-mail é o único que depende de
  // confirmação na caixa de entrada — sem a frase o lojista acha que trocou.
  assert.equal(mensagemDeSucesso("name"), "Nome atualizado.");
  assert.match(mensagemDeSucesso("email"), /Confirme na caixa de entrada/);
  assert.equal(mensagemDeSucesso("password"), "Senha atualizada.");
});

test("só a senha some do campo depois de salva", () => {
  assert.equal(limpaDepoisDeSalvar("password"), true);
  assert.equal(limpaDepoisDeSalvar("name"), false);
  assert.equal(limpaDepoisDeSalvar("email"), false);
});
