import { test } from "node:test";
import assert from "node:assert/strict";
import { canSendAlert } from "./alert-optout";

test("preferência ligada envia", () => {
  assert.equal(canSendAlert({ value: true, error: null }), true);
});

test("preferência desligada não envia", () => {
  assert.equal(canSendAlert({ value: false, error: null }), false);
});

test("tenant sem linha em tenant_settings recebe", () => {
  // Nunca abriu a tela de configurações. Todo alerta nasce ligado, senão a
  // migration que criou a coluna teria calado os alertas de toda a base.
  assert.equal(canSendAlert({ value: null, error: null }), true);
  assert.equal(canSendAlert({ value: undefined, error: null }), true);
});

test("erro de leitura não envia — falha fechado", () => {
  // Sem saber a preferência, enviar é pior que não enviar: manda e-mail pra
  // quem desligou. Vale mesmo quando o valor lido parece permitir.
  assert.equal(canSendAlert({ value: undefined, error: { code: "42703" } }), false);
  assert.equal(canSendAlert({ value: true, error: new Error("timeout") }), false);
});
