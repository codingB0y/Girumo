import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemParaLojista, traduzErro } from "./erros";
import { ZernioError } from "./types";

test("cartão, limite e rede têm frase própria; o resto cita o código sem vazar detalhe", () => {
  assert.match(mensagemParaLojista(new ZernioError(402, "permission_error", "payment_required", null, "x")), /cartão/i);
  assert.match(mensagemParaLojista(new ZernioError(429, "rate_limit_error", "rate_limited", null, "x")), /limite/i);
  assert.match(mensagemParaLojista(new ZernioError(0, "network_error", "network_error", null, "ECONNRESET")), /não respondeu/i);
  const outra = mensagemParaLojista(new ZernioError(400, "invalid_request_error", "missing_required_field", null, "details leak"));
  assert.match(outra, /missing_required_field/);
  assert.doesNotMatch(outra, /leak/);
});

test("códigos gravados no run viram frase curta; desconhecido mostra o código", () => {
  assert.equal(traduzErro(null), "");
  assert.match(traduzErro("window_expired"), /janela/i);
  assert.match(traduzErro("platform_api_error"), /Instagram recusou/i);
  assert.match(traduzErro("no_conversation"), /respond/i);
  assert.match(traduzErro("qualquer_coisa"), /qualquer_coisa/);
});
