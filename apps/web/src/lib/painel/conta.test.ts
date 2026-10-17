import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exigeSenhaAtual,
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
  // O nome tem mínimo próprio, que a rota já exigia: aceitar 1 letra aqui
  // manda o lojista clicar para receber um toast que a tela sabia prever.
  assert.equal(podeSalvarCampo("name", "A"), false);
  assert.equal(podeSalvarCampo("name", "Ao"), true);
  assert.equal(motivoDoBloqueio("name", "A"), "O nome precisa de pelo menos 2 letras.");
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

test("o e-mail só diz que trocou quando trocou de fato", () => {
  // Mutante: uma frase fixa. A troca de e-mail fica pendente até o link do
  // endereço novo ser clicado; dizer "atualizado" nesse caso faz o lojista
  // achar que já pode entrar com o e-mail novo.
  assert.equal(mensagemDeSucesso("name"), "Nome atualizado.");
  assert.match(mensagemDeSucesso("email", true), /link de confirmação/);
  assert.match(mensagemDeSucesso("email", true), /depois que você confirmar/);
  assert.equal(mensagemDeSucesso("email", false), "E-mail atualizado.");
  assert.match(mensagemDeSucesso("password"), /outros aparelhos/);
});

test("e-mail e senha pedem a senha atual; o nome não", () => {
  // Mutante: liberar o e-mail sem senha atual — era o que deixava quem pegou
  // a sessão aberta tomar a conta trocando o e-mail de login.
  assert.equal(exigeSenhaAtual("email"), true);
  assert.equal(exigeSenhaAtual("password"), true);
  assert.equal(exigeSenhaAtual("name"), false);
});

test("só a senha some do campo depois de salva", () => {
  assert.equal(limpaDepoisDeSalvar("password"), true);
  assert.equal(limpaDepoisDeSalvar("name"), false);
  assert.equal(limpaDepoisDeSalvar("email"), false);
});
