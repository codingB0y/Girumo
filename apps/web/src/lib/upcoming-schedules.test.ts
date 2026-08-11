import test from "node:test";
import assert from "node:assert/strict";
import {
  upcomingSchedules,
  formatWhen,
  formatDateTime,
  type ScheduleLike,
} from "./upcoming-schedules";

const NOW = new Date("2026-08-11T18:00:00.000Z"); // 15:00 em São Paulo
const TZ = "America/Sao_Paulo";

function s(id: string, at: string, status: ScheduleLike["status"] = "pending"): ScheduleLike {
  return { id, campaignName: `Campanha ${id}`, scheduledAt: at, status };
}

test("devolve só o que ainda não aconteceu, do mais próximo para o mais distante", () => {
  const list = upcomingSchedules(
    [
      s("c", "2026-08-13T12:00:00.000Z"),
      s("a", "2026-08-11T19:00:00.000Z"),
      s("passado", "2026-08-10T12:00:00.000Z"),
      s("b", "2026-08-12T12:00:00.000Z"),
    ],
    5,
    NOW,
  );

  assert.deepEqual(
    list.map((x) => x.id),
    ["a", "b", "c"],
  );
});

test("ignora agendamento que já rodou, falhou ou foi cancelado", () => {
  const list = upcomingSchedules(
    [
      s("ok", "2026-08-12T12:00:00.000Z"),
      s("enviado", "2026-08-12T13:00:00.000Z", "sent"),
      s("falhou", "2026-08-12T14:00:00.000Z", "failed"),
      s("cancelado", "2026-08-12T15:00:00.000Z", "canceled"),
    ],
    5,
    NOW,
  );

  assert.deepEqual(
    list.map((x) => x.id),
    ["ok"],
  );
});

test("respeita o limite pedido", () => {
  const list = upcomingSchedules(
    [
      s("1", "2026-08-12T10:00:00.000Z"),
      s("2", "2026-08-12T11:00:00.000Z"),
      s("3", "2026-08-12T12:00:00.000Z"),
    ],
    2,
    NOW,
  );

  assert.equal(list.length, 2);
});

test("agendamento sem data não entra em vez de virar Invalid Date", () => {
  const list = upcomingSchedules([{ id: "x", campaignName: "X", scheduledAt: "", status: "pending" }], 5, NOW);
  assert.equal(list.length, 0);
});

test("formata o que falta pouco em minutos", () => {
  assert.equal(formatWhen("2026-08-11T18:20:00.000Z", NOW, TZ), "em 20 min");
  assert.equal(formatWhen("2026-08-11T18:01:00.000Z", NOW, TZ), "em 1 min");
});

test("dentro do mesmo dia local mostra a hora, não a data", () => {
  // 22:00Z = 19:00 em São Paulo, mesmo dia 11.
  assert.equal(formatWhen("2026-08-11T22:00:00.000Z", NOW, TZ), "hoje às 19:00");
});

test("o dia seguinte local vira amanhã", () => {
  // 15:00Z do dia 12 = 12:00 em São Paulo do dia 12.
  assert.equal(formatWhen("2026-08-12T15:00:00.000Z", NOW, TZ), "amanhã às 12:00");
});

test("mais longe que amanhã mostra dia e mês", () => {
  assert.equal(formatWhen("2026-08-15T13:30:00.000Z", NOW, TZ), "15/08 às 10:30");
});

test("a virada do dia é a local, não a UTC", () => {
  // 2026-08-12T02:00Z ainda é 23:00 do dia 11 em São Paulo: é "hoje", não "amanhã".
  assert.equal(formatWhen("2026-08-12T02:00:00.000Z", NOW, TZ), "hoje às 23:00");
});

test("horário que já passou não vira contagem negativa", () => {
  assert.equal(formatWhen("2026-08-11T17:00:00.000Z", NOW, TZ), "agora");
});

test("última execução sai absoluta, no fuso local", () => {
  assert.equal(formatDateTime("2026-08-10T17:30:00.000Z", TZ), "10/08 às 14:30");
});

test("sem última execução devolve vazio, e quem chama escreve o texto", () => {
  assert.equal(formatDateTime(null, TZ), "");
  assert.equal(formatDateTime(undefined, TZ), "");
  assert.equal(formatDateTime("não é data", TZ), "");
});
