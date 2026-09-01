import assert from "node:assert/strict";
import { test } from "node:test";

import { podeAplicarQr } from "./instance-qr-guard";

test("QR atrasado nao rebaixa uma sessao ja aberta", () => {
  assert.equal(podeAplicarQr("connected"), false);
});

test("QR vale em qualquer estado sem sessao", () => {
  for (const status of ["pending", "qr", "connecting", "disconnected", "blocked", "error"]) {
    assert.equal(podeAplicarQr(status), true, `esperava aceitar QR em ${status}`);
  }
});

test("instancia sem status ainda aceita QR", () => {
  assert.equal(podeAplicarQr(null), true);
  assert.equal(podeAplicarQr(undefined), true);
});
