import test from "node:test";
import assert from "node:assert/strict";
import { dailySeries, dayKey, sparklinePoints } from "./sparkline";

const NOW = new Date("2026-08-10T12:00:00Z");

test("returns one slot per day, oldest first", () => {
  const series = dailySeries([], 14, NOW);
  assert.equal(series.length, 14);
  assert.deepEqual(series, new Array(14).fill(0));
});

test("sums same-day values into one slot", () => {
  const series = dailySeries(
    [
      { date: "2026-08-10T08:00:00Z", value: 100 },
      { date: "2026-08-10T20:00:00Z", value: 50 },
    ],
    3,
    NOW,
  );
  // último slot = hoje
  assert.deepEqual(series, [0, 0, 150]);
});

test("places each day in its own slot, in chronological order", () => {
  const series = dailySeries(
    [
      { date: "2026-08-08", value: 1 },
      { date: "2026-08-09", value: 2 },
      { date: "2026-08-10", value: 3 },
    ],
    3,
    NOW,
  );
  assert.deepEqual(series, [1, 2, 3]);
});

test("keeps quiet days as zero instead of dropping them", () => {
  const series = dailySeries([{ date: "2026-08-10", value: 5 }], 3, NOW);
  assert.deepEqual(series, [0, 0, 5]);
});

test("ignores items outside the window and items without a date", () => {
  const series = dailySeries(
    [
      { date: "2026-07-01", value: 999 },
      { value: 999 },
      { date: "2026-08-10", value: 7 },
    ],
    3,
    NOW,
  );
  assert.deepEqual(series, [0, 0, 7]);
});

test("counts entries when no value is given", () => {
  // leads não têm valor: contamos ocorrências passando value: 1
  const series = dailySeries(
    [
      { date: "2026-08-10", value: 1 },
      { date: "2026-08-10", value: 1 },
    ],
    2,
    NOW,
  );
  assert.deepEqual(series, [0, 2]);
});

test("dayKey walks back the requested number of days", () => {
  assert.equal(dayKey(0, NOW), "2026-08-10");
  assert.equal(dayKey(1, NOW), "2026-08-09");
  assert.equal(dayKey(10, NOW), "2026-07-31");
});

test("scales the polyline from zero, so the peak touches the top", () => {
  const points = sparklinePoints([0, 5, 10], 100, 20);
  assert.equal(points, "0,20 50,10 100,0");
});

test("draws a flat baseline when nothing happened in the window", () => {
  assert.equal(sparklinePoints([0, 0, 0], 100, 20), "0,20 50,20 100,20");
});

test("returns nothing for an empty series so callers can skip rendering", () => {
  assert.equal(sparklinePoints([], 100, 20), "");
});

test("centres a single point instead of dividing by zero", () => {
  assert.equal(sparklinePoints([4], 100, 20), "50,0");
});
