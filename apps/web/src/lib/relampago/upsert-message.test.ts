import assert from "node:assert/strict";
import { test } from "node:test";

import { parseUpsertMessage } from "./upsert-message";

const base = {
  key: {
    remoteJid: "120363300287692953@g.us",
    fromMe: false,
    id: "3EB0C767D26A8A3B1F27",
    participant: "221000000000000009@lid",
  },
  pushName: "Ana",
  message: { conversation: "EU QUERO" },
  messageTimestamp: 1788267791,
};

test("extrai os campos de uma mensagem simples", () => {
  const m = parseUpsertMessage(base);
  assert.ok(m);
  assert.equal(m.remoteJid, "120363300287692953@g.us");
  assert.equal(m.messageId, "3EB0C767D26A8A3B1F27");
  assert.equal(m.participantJid, "221000000000000009@lid");
  assert.equal(m.pushName, "Ana");
  assert.equal(m.text, "EU QUERO");
  assert.equal(m.commentedAt.toISOString(), "2026-09-01T13:03:11.000Z");
  // @lid não carrega telefone: sem dica, null. Nunca inventado.
  assert.equal(m.phoneHint, null);
});

test("lê texto de extendedTextMessage", () => {
  const m = parseUpsertMessage({
    ...base,
    message: { extendedTextMessage: { text: "eu quero esse" } },
  });
  assert.equal(m?.text, "eu quero esse");
});

test("mensagem sem texto (mídia, figurinha) devolve null", () => {
  assert.equal(parseUpsertMessage({ ...base, message: { imageMessage: {} } }), null);
  assert.equal(parseUpsertMessage({ ...base, message: null }), null);
});

test("aproveita o telefone quando a Evolution manda ao lado do lid", () => {
  // Se a v2.3.7 entregar participantAlt/senderPn, é telefone de graça — e a
  // cobertura do lid_map sobe sem esforço.
  const m = parseUpsertMessage({
    ...base,
    key: { ...base.key, participantAlt: "5511999998888@s.whatsapp.net" },
  });
  assert.equal(m?.phoneHint, "5511999998888");
});

test("messageTimestamp em string também vira data", () => {
  const m = parseUpsertMessage({ ...base, messageTimestamp: "1788267791" });
  assert.equal(m?.commentedAt.toISOString(), "2026-09-01T13:03:11.000Z");
});

test("sem participant devolve null — sem quem falou não há fila", () => {
  const semParticipante = { ...base, key: { ...base.key, participant: undefined } };
  assert.equal(parseUpsertMessage(semParticipante), null);
});
