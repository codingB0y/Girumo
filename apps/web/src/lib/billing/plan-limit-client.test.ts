import test from "node:test";
import assert from "node:assert/strict";

import { PlanLimitError, toPlanLimitError, upgradeUrlFrom } from "./plan-limit-client";

function resposta(corpo: unknown, ok = false): Response {
  return {
    ok,
    json: async () => corpo,
  } as unknown as Response;
}

test("preserva mensagem, caminho de saida e codigo do 402", () => {
  return toPlanLimitError(
    resposta({
      error: "Seu plano atual não inclui disparos. Escolha um plano pra liberar.",
      code: "plan_blocked",
      upgradeUrl: "/painel/configuracoes",
    }),
    "Erro ao enviar.",
  ).then((erro) => {
    assert.match(erro.message, /não inclui disparos/);
    assert.equal(erro.upgradeUrl, "/painel/configuracoes");
    assert.equal(erro.code, "plan_blocked");
  });
});

test("erro que nao e de plano nao inventa botao", async () => {
  // Um 500 do banco nao deve mandar o cliente para a tela de planos: sugerir
  // upgrade para quem esbarrou num defeito nosso e pior que nao sugerir nada.
  const erro = await toPlanLimitError(resposta({ error: "Falha ao gravar." }), "Erro.");
  assert.equal(erro.upgradeUrl, null);
  assert.equal(erro.code, null);
});

test("corpo que nao e JSON cai no texto de reserva", async () => {
  // O caso que originou tudo: gate respondendo text/plain fazia o parse
  // estourar e a tela mostrava "Erro ao criar." sem pista nenhuma.
  const quebrada = {
    ok: false,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  } as unknown as Response;

  const erro = await toPlanLimitError(quebrada, "Erro ao enviar mensagem.");
  assert.equal(erro.message, "Erro ao enviar mensagem.");
  assert.equal(erro.upgradeUrl, null);
});

test("upgradeUrlFrom so reconhece erro de plano", () => {
  assert.equal(upgradeUrlFrom(new PlanLimitError("x", "/painel/configuracoes", "plan_blocked")), "/painel/configuracoes");
  assert.equal(upgradeUrlFrom(new Error("erro comum")), null);
  assert.equal(upgradeUrlFrom(null), null);
  assert.equal(upgradeUrlFrom("texto"), null);
});
