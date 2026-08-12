import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeInviteUrl } from "./invite-url";

const CANONICAL = "https://chat.whatsapp.com/KxY7bQ2mNp";

test("aceita a URL completa e devolve a forma canônica", () => {
  assert.equal(normalizeInviteUrl("https://chat.whatsapp.com/KxY7bQ2mNp"), CANONICAL);
});

test("aceita sem protocolo, com www e com barra no fim", () => {
  assert.equal(normalizeInviteUrl("www.chat.whatsapp.com/KxY7bQ2mNp/"), CANONICAL);
  assert.equal(normalizeInviteUrl("chat.whatsapp.com/KxY7bQ2mNp"), CANONICAL);
});

test("aceita o formato /invite/ antigo", () => {
  assert.equal(normalizeInviteUrl("https://chat.whatsapp.com/invite/KxY7bQ2mNp"), CANONICAL);
});

test("descarta query e âncora que vêm coladas do compartilhamento", () => {
  assert.equal(normalizeInviteUrl("https://chat.whatsapp.com/KxY7bQ2mNp?mode=ac_t"), CANONICAL);
  assert.equal(normalizeInviteUrl("https://chat.whatsapp.com/KxY7bQ2mNp#x"), CANONICAL);
});

test("aceita o código colado sozinho", () => {
  assert.equal(normalizeInviteUrl("KxY7bQ2mNp"), CANONICAL);
});

test("apara espaço em volta — colar de app de mensagem traz espaço", () => {
  assert.equal(normalizeInviteUrl("  https://chat.whatsapp.com/KxY7bQ2mNp  "), CANONICAL);
});

test("recusa link que não é convite de grupo do WhatsApp", () => {
  // O caso que importa: um link plausível que levaria o cliente pra lugar nenhum.
  assert.equal(normalizeInviteUrl("https://wa.me/5511999999999"), null);
  assert.equal(normalizeInviteUrl("https://example.com/KxY7bQ2mNp"), null);
  assert.equal(normalizeInviteUrl("https://chat.whatsapp.com.evil.com/KxY7bQ2mNp"), null);
});

test("recusa vazio, espaço em branco e código curto demais", () => {
  assert.equal(normalizeInviteUrl(""), null);
  assert.equal(normalizeInviteUrl("   "), null);
  assert.equal(normalizeInviteUrl("abc"), null);
});
