import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldRemoveFromVercel } from "./removal";

const EU = "loja-a";
const OUTRA = "loja-b";

test("ativo e dono é a própria conta: remove", () => {
  assert.equal(shouldRemoveFromVercel({ status: "active", lastError: null }, EU, EU), true);
});

test("pendente que nunca foi verificado: nunca pôs o host no projeto", () => {
  assert.equal(shouldRemoveFromVercel({ status: "pending", lastError: null }, null, EU), false);
});

test("pendente parado no TXT de posse: não passou da prova", () => {
  assert.equal(shouldRemoveFromVercel({ status: "pending", lastError: "txt" }, null, EU), false);
});

test("pendente que passou do TXT (dns) e ninguém mais usa o host: remove", () => {
  assert.equal(shouldRemoveFromVercel({ status: "pending", lastError: "dns" }, null, EU), true);
});

test("pendente que passou do TXT mas outra conta tem o host ativo: não remove", () => {
  assert.equal(shouldRemoveFromVercel({ status: "pending", lastError: "dns" }, OUTRA, EU), false);
});

test("pendente em-uso e outra conta tem o host ativo: não remove", () => {
  assert.equal(shouldRemoveFromVercel({ status: "pending", lastError: "em-uso" }, OUTRA, EU), false);
});
