import assert from "node:assert/strict";
import { test } from "node:test";

import { precisaConferirConexao, telefoneDoFetchInstances } from "./reconciliacao";

/**
 * O caso que motivou: o celular pareou, o `connection.update` com `open` se
 * perdeu, e o banco ficou em `qr` — o painel dizia "desconectado" para sempre.
 */
test("instância presa em qr, desconectada ou com erro é conferida na Evolution", () => {
  for (const status of ["pending", "qr", "connecting", "disconnected", "error"]) {
    assert.equal(precisaConferirConexao({ status, provider_instance_id: "gr_x" }), true, status);
  }
});

test("conectada não é conferida: o webhook de close é quem derruba", () => {
  assert.equal(precisaConferirConexao({ status: "connected", provider_instance_id: "gr_x" }), false);
});

test("banida não é conferida", () => {
  assert.equal(precisaConferirConexao({ status: "blocked", provider_instance_id: "gr_x" }), false);
});

test("sem instância na Evolution não há o que conferir", () => {
  assert.equal(precisaConferirConexao({ status: "qr", provider_instance_id: null }), false);
});

test("telefone sai do ownerJid do fetchInstances", () => {
  assert.equal(
    telefoneDoFetchInstances([{ name: "gr_x", ownerJid: "5551999998888@s.whatsapp.net" }]),
    "5551999998888",
  );
});

test("formato inesperado do fetchInstances não inventa telefone", () => {
  assert.equal(telefoneDoFetchInstances(null), null);
  assert.equal(telefoneDoFetchInstances([]), null);
  assert.equal(telefoneDoFetchInstances([{ ownerJid: null }]), null);
  assert.equal(telefoneDoFetchInstances([{ ownerJid: "123@lid" }]), null);
  assert.equal(telefoneDoFetchInstances("erro"), null);
});
