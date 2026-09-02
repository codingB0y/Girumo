import test from "node:test";
import assert from "node:assert/strict";
import { INTEGRACOES_DEFAULTS } from "@/lib/campaigns/settings";
import { apresentaIntegracoes } from "./apresenta";

test("GET nunca devolve o token inteiro", () => {
  const saida = apresentaIntegracoes({
    ...INTEGRACOES_DEFAULTS,
    meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "EAAabcdefgh3456", test_code: "T1" },
  });
  const texto = JSON.stringify(saida);
  assert.equal(texto.includes("EAAabcdefgh"), false, "o valor do token não pode sair");
  assert.equal(texto.includes('"capi_token"'), false, "a chave capi_token não pode existir na saída");
  assert.equal(saida.meta.capi_token_set, true);
  assert.equal(saida.meta.capi_token_last4, "3456");
  // O resto continua visível: é o que o formulário precisa reexibir.
  assert.equal(saida.meta.pixel_id, "1234567890");
  assert.equal(saida.meta.evento, "Lead");
  assert.equal(saida.meta.test_code, "T1");
});

test("sem token: set=false e last4 vazio", () => {
  const saida = apresentaIntegracoes(INTEGRACOES_DEFAULTS);
  assert.equal(saida.meta.capi_token_set, false);
  assert.equal(saida.meta.capi_token_last4, "");
});
