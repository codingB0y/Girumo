import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInviteUrl, parseInviteResponse } from "./invite-url.js";

test("aceita só o código e devolve a URL canônica", () => {
  assert.equal(normalizeInviteUrl("ABC123xyz"), "https://chat.whatsapp.com/ABC123xyz");
});

test("aceita as variações que a Evolution devolve e normaliza todas", () => {
  const canonica = "https://chat.whatsapp.com/ABC123xyz";
  for (const entrada of [
    "https://chat.whatsapp.com/ABC123xyz",
    "http://chat.whatsapp.com/ABC123xyz",
    "https://www.chat.whatsapp.com/ABC123xyz",
    "chat.whatsapp.com/ABC123xyz",
    "https://chat.whatsapp.com/invite/ABC123xyz",
    "https://chat.whatsapp.com/ABC123xyz/",
    "https://chat.whatsapp.com/ABC123xyz?from=app",
  ]) {
    assert.equal(normalizeInviteUrl(entrada), canonica, `falhou em: ${entrada}`);
  }
});

test("recusa host que não é o do WhatsApp", () => {
  // Este valor vira o destino do /r/<campanha>. Aceitar host alheio mandaria o
  // cliente da loja para fora — falha que não aparece no painel, só no funil.
  assert.equal(normalizeInviteUrl("https://evil.example/ABC123xyz"), null);
  assert.equal(normalizeInviteUrl("https://chat.whatsapp.com.evil.example/ABC123"), null);
});

test("recusa vazio e código curto demais para ser convite", () => {
  assert.equal(normalizeInviteUrl(""), null);
  assert.equal(normalizeInviteUrl("   "), null);
  assert.equal(normalizeInviteUrl("abc"), null);
});

test("lê inviteUrl do corpo da Evolution", () => {
  assert.equal(
    parseInviteResponse({ inviteUrl: "https://chat.whatsapp.com/ABC123xyz" }),
    "https://chat.whatsapp.com/ABC123xyz",
  );
});

test("lê inviteCode quando é o campo que veio", () => {
  // A v2.3.7 responde ora um, ora outro — por isso os dois são tentados.
  assert.equal(parseInviteResponse({ inviteCode: "ABC123xyz" }), "https://chat.whatsapp.com/ABC123xyz");
});

test("inviteUrl tem precedência sobre inviteCode quando os dois vêm", () => {
  const parsed = parseInviteResponse({
    inviteUrl: "https://chat.whatsapp.com/DAURL1",
    inviteCode: "DOCODE1",
  });
  assert.equal(parsed, "https://chat.whatsapp.com/DAURL1");
});

test("corpo sem convite utilizável devolve null em vez de string quebrada", () => {
  // O caller trata null como "sem link" e falha o job — melhor que gravar
  // "https://chat.whatsapp.com/undefined" no pool.
  assert.equal(parseInviteResponse({}), null);
  assert.equal(parseInviteResponse({ inviteUrl: "" }), null);
  assert.equal(parseInviteResponse(null), null);
  assert.equal(parseInviteResponse("ABC123xyz"), null);
  assert.equal(parseInviteResponse({ inviteCode: 42 }), null);
});
