import assert from "node:assert/strict";
import { test } from "node:test";

import { diaDaMensagem, rotuloDoDia } from "./agenda-dias";

// O CI roda em UTC. As datas abaixo foram escolhidas na janela 21h-24h de
// Brasília, quando o dia em UTC já virou e o de Brasília ainda não.
const TARDE = new Date("2026-10-16T15:00:00-03:00");
const NOITE = new Date("2026-10-16T21:30:00-03:00");

test("post das 22h de Brasília fica no dia dele, não no seguinte", () => {
  // 16/10 22:00 em Brasília, como o PostgREST devolve.
  assert.equal(diaDaMensagem({ scheduledAt: "2026-10-17T01:00:00+00:00", createdAt: "2026-10-15T12:00:00Z" }), "2026-10-16");
});

test("sem agendamento, o dia é o da criação, em Brasília", () => {
  assert.equal(diaDaMensagem({ createdAt: "2026-10-17T02:59:00Z" }), "2026-10-16");
});

test("olhando às 15h, o post das 22h de hoje é Hoje, não Amanhã", () => {
  const dia = diaDaMensagem({ scheduledAt: "2026-10-17T01:00:00+00:00", createdAt: "2026-10-16T12:00:00Z" });
  assert.equal(rotuloDoDia(dia, TARDE), "Hoje");
});

test("olhando às 21h30, o post das 10h de hoje continua Hoje, não Ontem", () => {
  const dia = diaDaMensagem({ scheduledAt: "2026-10-16T13:00:00+00:00", createdAt: "2026-10-16T12:00:00Z" });
  assert.equal(rotuloDoDia(dia, NOITE), "Hoje");
});

test("às 21h30, ontem e amanhã são os de Brasília", () => {
  assert.equal(rotuloDoDia("2026-10-15", NOITE), "Ontem");
  assert.equal(rotuloDoDia("2026-10-17", NOITE), "Amanhã");
  assert.equal(rotuloDoDia("2026-10-18", NOITE).includes("18"), true);
});
