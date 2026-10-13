import assert from "node:assert/strict";
import { test } from "node:test";

import { MONTH_FORMAT, brasiliaMonth, monthRange } from "./month";

test("o mês vira à meia-noite de Brasília, três horas depois de Greenwich", () => {
  assert.equal(brasiliaMonth(new Date("2026-11-01T02:59:59.999Z")), "2026-10");
  assert.equal(brasiliaMonth(new Date("2026-11-01T03:00:00.000Z")), "2026-11");
});

test("faixa do mês: dia 1 às 00h de Brasília até o dia 1 seguinte, exclusivo", () => {
  assert.deepEqual(monthRange("2026-10"), { start: "2026-10-01T03:00:00.000Z", end: "2026-11-01T03:00:00.000Z" });
  // Mutante: dezembro sem virar o ano.
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01T03:00:00.000Z", end: "2027-01-01T03:00:00.000Z" });
});

test("formato aceito em ?mes=", () => {
  for (const valid of ["2026-01", "2026-10", "2099-12"]) assert.ok(MONTH_FORMAT.test(valid), valid);
  for (const invalid of ["2026-13", "2026-00", "2026-1", "1999-12", "2026-10-01", "out/2026", ""]) {
    assert.ok(!MONTH_FORMAT.test(invalid), invalid);
  }
});
