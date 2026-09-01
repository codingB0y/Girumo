import test from "node:test";
import assert from "node:assert/strict";
import { weeklyRhythm, WEEK_DAYS } from "./weekly-rhythm";

// Uma quarta-feira, pra que a janela de 7 dias atravesse a virada de semana.
const NOW = new Date("2026-08-12T15:00:00.000Z");

test("devolve sempre 7 dias, do mais antigo para hoje", () => {
  const bars = weeklyRhythm([], NOW);

  assert.equal(bars.length, WEEK_DAYS);
  assert.equal(bars[0].date, "2026-08-06");
  assert.equal(bars[WEEK_DAYS - 1].date, "2026-08-12");
  assert.equal(bars[WEEK_DAYS - 1].isToday, true);
  assert.equal(bars[0].isToday, false);
});

test("dia sem movimento vale zero — é informação, não buraco", () => {
  const bars = weeklyRhythm([{ enteredAt: "2026-08-10T09:00:00.000Z" }], NOW);

  assert.deepEqual(
    bars.map((b) => b.count),
    [0, 0, 0, 0, 1, 0, 0],
  );
});

test("soma as entradas do mesmo dia", () => {
  const bars = weeklyRhythm(
    [
      { enteredAt: "2026-08-12T01:00:00.000Z" }, // 11/08 22h em SP → ontem
      { enteredAt: "2026-08-12T23:59:00.000Z" }, // 12/08 20h59 em SP → hoje
      { enteredAt: "2026-08-11T12:00:00.000Z" }, // 11/08 09h em SP → ontem
    ],
    NOW,
  );

  assert.equal(bars[WEEK_DAYS - 1].count, 1);
  assert.equal(bars[WEEK_DAYS - 2].count, 2);
});

test("ignora entrada fora da janela e entrada sem data", () => {
  const bars = weeklyRhythm(
    [
      { enteredAt: "2026-08-05T23:00:00.000Z" }, // um dia antes da janela
      { enteredAt: "2026-09-01T10:00:00.000Z" }, // no futuro
      { enteredAt: "" },
      {},
    ],
    NOW,
  );

  assert.equal(
    bars.reduce((a, b) => a + b.count, 0),
    0,
  );
});

test("agrupa pelo dia de Brasília, igual ao resto do painel", () => {
  // 2026-08-12T02:00Z é 23h de 11/ago em Brasília. Fatiado em UTC, o painel
  // colocava essa entrada em "hoje" — o lojista via a barra de hoje subir por
  // causa de gente que entrou ontem à noite.
  const bars = weeklyRhythm([{ enteredAt: "2026-08-12T02:00:00.000Z" }], NOW);

  assert.equal(bars[WEEK_DAYS - 2].date, "2026-08-11");
  assert.equal(bars[WEEK_DAYS - 2].count, 1);
  assert.equal(bars[WEEK_DAYS - 1].count, 0);
});

test("rotula cada barra com dia da semana e data em pt-BR", () => {
  const bars = weeklyRhythm([{ enteredAt: "2026-08-12T10:00:00.000Z" }], NOW);
  const today = bars[WEEK_DAYS - 1];

  assert.equal(today.weekdayShort, "qua");
  assert.equal(today.label, "Hoje, 12/08");
  assert.equal(bars[WEEK_DAYS - 2].label, "Ontem, 11/08");
  assert.equal(bars[0].label, "quinta, 06/08");
});

test("o pico da janela é o teto da escala", () => {
  const bars = weeklyRhythm(
    [
      { enteredAt: "2026-08-10T09:00:00.000Z" },
      { enteredAt: "2026-08-10T10:00:00.000Z" },
      { enteredAt: "2026-08-12T10:00:00.000Z" },
    ],
    NOW,
  );

  assert.equal(Math.max(...bars.map((b) => b.count)), 2);
});
