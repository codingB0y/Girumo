import assert from "node:assert/strict";
import test from "node:test";
import { classificar } from "./ligacao.mjs";

const FONES = { CHIP: "5511999990001", B: "5511999990002", C: "5511999990003" };
const T = (s) => `2026-10-29T17:00:${String(s).padStart(2, "0")}.000Z`;
const upsert = (seq, s, key, message = { conversation: "x" }) => ({ seq, chegada: T(s), body: { event: "messages.upsert", data: { key: { id: `R${seq}`, fromMe: false, ...key }, message } } });
const update = (seq, s, d) => ({ seq, chegada: T(s), body: { event: "messages.update", data: d } });
const ENVIADOS = [
  { keyId: "K1", para: "B", jid: "5511999990002@s.whatsapp.net", em: T(1) },
  { keyId: "K2", para: "C", jid: "5511999990003@s.whatsapp.net", em: T(2) },
];

test("GO: as três formas determinísticas ligam a resposta ao telefone", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      update(10, 5, { keyId: "K1", remoteJid: "222222@lid", status: "DELIVERY_ACK" }),
      upsert(11, 9, { remoteJid: "5511999990002@s.whatsapp.net" }),
      upsert(12, 10, { remoteJid: "333333@lid", remoteJidAlt: "5511999990003@s.whatsapp.net" }),
      upsert(13, 11, { remoteJid: "222222@lid" }),
    ],
  });
  assert.deepEqual(r.linhas.map((l) => [l.rotulo, l.via]), [["B", "telefone_direto"], ["C", "lid_com_telefone_ao_lado"], ["B", "lid_aprendido_no_update"]]);
  assert.equal(r.veredito, "GO");
  assert.equal(r.linhas[2].ackAntes, true);
});

test("NO-GO: uma resposta em @lid sem nenhuma ligação reprova o automático", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [upsert(1, 9, { remoteJid: "5511999990002@s.whatsapp.net" }), upsert(2, 10, { remoteJid: "5511999990003@s.whatsapp.net" }), upsert(3, 11, { remoteJid: "999999@lid" })],
  });
  assert.equal(r.orfas, 1);
  assert.equal(r.veredito, "NO-GO");
});

test("INCONCLUSIVO com menos de 3 respostas a envios nossos", () => {
  const r = classificar({ celulares: FONES, enviados: ENVIADOS, eventos: [upsert(1, 9, { remoteJid: "5511999990002@s.whatsapp.net" })] });
  assert.equal(r.veredito, "INCONCLUSIVO");
});

test("corrida: a resposta pode chegar antes do ack (ackAntes=false) e ainda assim ligar", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [upsert(1, 4, { remoteJid: "222222@lid" }), update(2, 6, { keyId: "K1", remoteJid: "222222@lid", status: "DELIVERY_ACK" })],
  });
  assert.equal(r.linhas[0].via, "lid_aprendido_no_update");
  assert.equal(r.linhas[0].ackAntes, false);
});

test("o 9º dígito não atrapalha, e mensagem de grupo e do próprio chip não entram na conta", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      upsert(1, 9, { remoteJid: "551199990002@s.whatsapp.net" }), // JID sem o 9
      upsert(2, 9, { remoteJid: "120363000000000000@g.us" }),
      { seq: 3, chegada: T(9), body: { event: "messages.upsert", data: { key: { id: "K1", fromMe: true, remoteJid: "5511999990002@s.whatsapp.net" }, message: {} } } },
      { seq: 4, chegada: T(9), body: { event: "messages.upsert", data: { key: { id: "OUTRO", fromMe: true, remoteJid: "5511999990002@s.whatsapp.net" }, message: {} } } },
    ],
  });
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].rotulo, "B");
  assert.equal(r.ecoDoEnvio, "1/2");
  assert.equal(r.peloCelular, 1);
});

test("tempos, status vistos e fromMe do update saem do key.id; update que não casa aparece na conta", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      update(1, 2, { keyId: "K1", status: "SERVER_ACK", fromMe: true }),
      update(2, 3, { keyId: "K1", status: "DELIVERY_ACK", fromMe: true }),
      update(3, 20, { keyId: "K1", status: "READ", fromMe: true }),
      update(4, 21, { keyId: "OUTRO-ID", status: "READ", fromMe: true }),
    ],
  });
  assert.deepEqual(r.entregas[0], { para: "B", entregaS: 2, leituraS: 19, statuses: ["SERVER_ACK", "DELIVERY_ACK", "READ"], fromMe: [true] });
  assert.equal(r.entregas[1].entregaS, null);
  assert.equal(r.updatesCasados, "3/4");
});

test("o que vem ao lado do remoteJid é classificado: telefone, lid (caso B do plano 4) ou nada", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      upsert(1, 9, { remoteJid: "5511999990002@s.whatsapp.net", remoteJidAlt: "5511999990002@s.whatsapp.net" }),
      upsert(2, 10, { remoteJid: "5511999990002@s.whatsapp.net", remoteJidAlt: "777777@lid" }),
      upsert(3, 11, { remoteJid: "5511999990002@s.whatsapp.net" }),
    ],
  });
  assert.deepEqual(r.linhas.map((l) => l.altTipo), ["telefone", "lid", "-"]);
});
