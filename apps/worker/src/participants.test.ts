import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeParticipant, phoneFromJid } from "./participants.js";

// Fixtures reais capturadas na F1, compartilhadas com os schemas da F2.
const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "web",
  "src",
  "lib",
  "evolution",
  "__fixtures__",
);

function fixtureParticipant(file: string) {
  const raw = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
  return raw.data.participants[0];
}

test("phoneFromJid extrai dígitos de um @s.whatsapp.net", () => {
  assert.equal(phoneFromJid("5511999990001@s.whatsapp.net"), "5511999990001");
});

test("phoneFromJid remove o sufixo de device", () => {
  assert.equal(phoneFromJid("5511999990001:12@s.whatsapp.net"), "5511999990001");
});

test("phoneFromJid devolve null para @lid (sem telefone real)", () => {
  assert.equal(phoneFromJid("20100000000000001@lid"), null);
});

test("phoneFromJid devolve null para vazio, nulo ou domínio ausente", () => {
  assert.equal(phoneFromJid(null), null);
  assert.equal(phoneFromJid(undefined), null);
  assert.equal(phoneFromJid(""), null);
  assert.equal(phoneFromJid("5511999990001"), null);
});

test("phoneFromJid rejeita dígitos fora da faixa de telefone", () => {
  assert.equal(phoneFromJid("123@s.whatsapp.net"), null); // curto demais
  assert.equal(phoneFromJid("1234567890123456@s.whatsapp.net"), null); // longo demais
});

test("normalizeParticipant tira o telefone de phoneNumber, não do id @lid", () => {
  // Caso real: id é @lid, o telefone verdadeiro está em phoneNumber.
  const result = normalizeParticipant({
    id: "20100000000000001@lid",
    phoneNumber: "5511999990002@s.whatsapp.net",
    admin: null,
  });
  assert.equal(result.phone, "5511999990002");
  assert.equal(result.jid, "20100000000000001@lid");
});

test("normalizeParticipant devolve phone null para @lid sem phoneNumber", () => {
  const result = normalizeParticipant({ id: "20100000000000001@lid", phoneNumber: null });
  assert.equal(result.phone, null);
  assert.equal(result.jid, "20100000000000001@lid");
});

test("normalizeParticipant cai para o id quando ele é @s.whatsapp.net", () => {
  const result = normalizeParticipant({ id: "5511999990003@s.whatsapp.net" });
  assert.equal(result.phone, "5511999990003");
});

test("normalizeParticipant casa a fixture real de add", () => {
  const result = normalizeParticipant(fixtureParticipant("group-participants-update.add.json"));
  assert.equal(result.phone, "5511999990002");
});

test("normalizeParticipant casa a fixture real de remove (mesma forma)", () => {
  const result = normalizeParticipant(fixtureParticipant("group-participants-update.remove.json"));
  assert.equal(result.phone, "5511999990002");
});
