import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MENSAGEM_DE_LIMITE,
  linkDeRecuperacaoFalhou,
  mensagemDaNovaSenha,
  mensagemDoNovoEmail,
  tipoDaFalhaDeLogin,
} from "./erros-do-auth";

test("login: limite do Supabase não vira 'senha incorreta'", () => {
  // Mutante: tratar todo erro como credencial — era o que o login fazia, e o
  // lojista barrado pelo teto de tentativas ficava trocando a senha certa.
  assert.equal(tipoDaFalhaDeLogin({ status: 429, code: "over_request_rate_limit" }), "limite");
  assert.equal(tipoDaFalhaDeLogin({ status: 400, code: "invalid_credentials" }), "credencial");
  assert.equal(tipoDaFalhaDeLogin({ status: 400, code: "email_not_confirmed" }), "credencial");
  // Rede caída (supabase-js devolve status 0) e Auth fora do ar não são culpa da senha.
  assert.equal(tipoDaFalhaDeLogin({ status: 0 }), "indisponivel");
  assert.equal(tipoDaFalhaDeLogin({ status: 500 }), "indisponivel");
  assert.equal(tipoDaFalhaDeLogin({}), "indisponivel");
});

test("nova senha: erros do Supabase saem em português", () => {
  assert.equal(mensagemDaNovaSenha({ code: "same_password" }), "A senha nova precisa ser diferente da atual.");
  assert.match(mensagemDaNovaSenha({ code: "weak_password" }), /fácil de adivinhar/);
  assert.equal(mensagemDaNovaSenha({ status: 429 }), MENSAGEM_DE_LIMITE);
  // O texto cru do supabase-js (em inglês) nunca chega na tela.
  assert.equal(mensagemDaNovaSenha({ message: "Auth session missing!" }), "Não foi possível salvar a senha. Tente de novo.");
});

test("novo e-mail: endereço de outra conta e limite de envio saem em português", () => {
  assert.equal(mensagemDoNovoEmail({ status: 422, code: "email_exists" }), "Este e-mail já é usado por outra conta.");
  // Teto de envio de e-mail do Supabase (429): não é culpa do endereço digitado.
  assert.equal(mensagemDoNovoEmail({ status: 429, code: "over_email_send_rate_limit" }), MENSAGEM_DE_LIMITE);
  assert.equal(mensagemDoNovoEmail({ status: 500 }), "Não foi possível trocar o e-mail. Tente de novo.");
});

test("link de recuperação vencido ou já usado é reconhecido pelo hash", () => {
  // O Supabase devolve o erro no fragmento: o supabase-js engole e a página
  // seguia mostrando o formulário de um link que já não vale.
  assert.equal(
    linkDeRecuperacaoFalhou("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    true,
  );
  assert.equal(linkDeRecuperacaoFalhou("#error_code=otp_expired"), true);
  assert.equal(linkDeRecuperacaoFalhou("?error=access_denied"), true);
  assert.equal(linkDeRecuperacaoFalhou("#access_token=abc&type=recovery"), false);
  assert.equal(linkDeRecuperacaoFalhou(""), false);
});
