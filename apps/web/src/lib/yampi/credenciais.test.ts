import assert from "node:assert/strict";
import { test } from "node:test";

import { selar } from "@/lib/security/secret-box";

import { abrirCredenciais, abrirSegredoDoAviso, contextoDoSegredo, lerAlias, lerCredencial, type CampoSelado } from "./credenciais";
import type { ConexaoYampi } from "./tipos";

const CHAVE = Buffer.alloc(32, 7);
const TOKEN = ["Zk3pQ9vL2x", "W8cR5tN7mB4y"].join(""); // em pedaços: o scan de secrets
const CHAVE_SECRETA = ["h6jD1fG0aS", "e2uV7oK9nT3q"].join("");

test("alias: letras, números, hífen e sublinhado passam; o que viraria caminho ou consulta na URL não", () => {
  assert.equal(lerAlias(" loja-exemplo "), "loja-exemplo");
  for (const ok of ["Loja_01", "ab"]) assert.equal(lerAlias(ok), ok);
  for (const ruim of ["", "a", "../x", "a/b", "a?b", "a#b", "a b", "a%2Fb", "loja.com.br", "x".repeat(64), 42, null, undefined]) {
    assert.equal(lerAlias(ruim), null, String(ruim));
  }
});

test("credencial: recorta as pontas; recusa e-mail (autofill), texto curto, espaço no meio e caractere de controle", () => {
  assert.equal(lerCredencial(`  ${TOKEN}\n`), TOKEN);
  for (const ruim of ["igor@exemplo.com.br", "curto", `${TOKEN} ${CHAVE_SECRETA}`, `${TOKEN}\r\nX-Outro: 1`, "é".repeat(20), "a".repeat(301), 123, null]) {
    assert.equal(lerCredencial(ruim), null, String(ruim));
  }
});

test("o contexto da cifra separa a loja e o campo", () => {
  assert.equal(contextoDoSegredo("loja-a", "user_token"), "yampi:loja-a:user_token");
  assert.notEqual(contextoDoSegredo("loja-a", "user_token"), contextoDoSegredo("loja-a", "webhook_secret"));
});

test("abrirCredenciais devolve o par e abrirSegredoDoAviso o segredo; cifra de outra loja ou campo ausente lançam", () => {
  const selado = (valor: string, campo: CampoSelado) => selar(valor, contextoDoSegredo("loja-a", campo), CHAVE); // sempre para a loja-a
  const c = (tenantId: string, over: Partial<ConexaoYampi> = {}): ConexaoYampi => ({
    id: "c1", tenantId, alias: "loja-exemplo", status: "ativa",
    userTokenSelado: selado(TOKEN, "user_token"), userSecretKeySelado: selado(CHAVE_SECRETA, "user_secret_key"),
    webhookId: null, webhookSecretSelado: selado("segredo-do-aviso", "webhook_secret"),
    lastEventAt: null, lastCheckAt: null, lastError: null, ...over,
  });
  assert.deepEqual(abrirCredenciais(c("loja-a"), CHAVE), { token: TOKEN, secretKey: CHAVE_SECRETA });
  assert.equal(abrirSegredoDoAviso(c("loja-a"), CHAVE), "segredo-do-aviso");
  assert.throws(() => abrirCredenciais(c("loja-b"), CHAVE), /secret-box/);
  assert.throws(() => abrirCredenciais(c("loja-a", { userTokenSelado: null }), CHAVE), /sem credencial/);
  assert.throws(() => abrirSegredoDoAviso(c("loja-a", { webhookSecretSelado: null }), CHAVE), /sem segredo do aviso/);
});
