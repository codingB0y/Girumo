import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEmailLogRow, maskEmail } from "./delivery-log";

test("sucesso vira email.sent em level info", () => {
  const row = buildEmailLogRow({
    tenantId: "9888373f-e57b-44cb-9cf6-2d8944783150",
    kind: "invite",
    to: "financeiromegastock@gmail.com",
    ok: true,
  });

  assert.equal(row.event, "email.sent");
  assert.equal(row.level, "info");
  assert.equal(row.tenant_id, "9888373f-e57b-44cb-9cf6-2d8944783150");
  assert.equal(row.metadata.kind, "invite");
});

test("falha vira email.failed em level error, com o motivo", () => {
  const row = buildEmailLogRow({
    tenantId: "t1",
    kind: "welcome",
    to: "alguem@exemplo.com",
    ok: false,
    reason: "RESEND_API_KEY não configurada.",
  });

  assert.equal(row.event, "email.failed");
  assert.equal(row.level, "error");
  assert.equal(row.metadata.reason, "RESEND_API_KEY não configurada.");
});

// Sem isto uma falha entraria no banco indistinguível de sucesso ao filtrar por
// motivo — e o objetivo do card é justamente achar a falha por SQL.
test("falha sem motivo ainda grava algo procuravel", () => {
  const row = buildEmailLogRow({ tenantId: "t1", kind: "weekly", to: "a@b.com", ok: false });
  assert.equal(row.metadata.reason, "motivo desconhecido");
});

test("motivo gigante e cortado para nao inchar o log", () => {
  const row = buildEmailLogRow({
    tenantId: "t1",
    kind: "weekly",
    to: "a@b.com",
    ok: false,
    reason: "x".repeat(1000),
  });

  assert.equal(String(row.metadata.reason).length, 300);
});

test("o endereco e mascarado no log", () => {
  assert.equal(maskEmail("financeiromegastock@gmail.com"), "fi***@gmail.com");
  assert.equal(maskEmail("ab@b.com"), "ab***@b.com");
});

test("endereco curto ou invalido nao vaza nem quebra", () => {
  assert.equal(maskEmail("a@b.com"), "a***@b.com");
  assert.equal(maskEmail("semarroba"), "***");
  assert.equal(maskEmail(""), "***");
});

test("a mensagem nunca carrega o endereco inteiro", () => {
  const row = buildEmailLogRow({
    tenantId: "t1",
    kind: "invite",
    to: "financeiromegastock@gmail.com",
    ok: true,
  });

  assert.doesNotMatch(row.message, /financeiromegastock/);
  assert.match(row.message, /fi\*\*\*@gmail\.com/);
});
