import test from "node:test";
import assert from "node:assert/strict";
import { currentMonth, ordersInMonth, revenueInMonth } from "./painel-metrics";

const MONTH = "2026-08";

test("sums only the orders created in the requested month", () => {
  const orders = [
    { value: 150, created_at: "2026-08-02T10:00:00Z" },
    { value: 99.9, created_at: "2026-08-31T23:59:00Z" },
    { value: 500, created_at: "2026-07-31T23:59:00Z" },
  ];
  assert.equal(revenueInMonth(orders, MONTH), 249.9);
});

test("leaves orders without a date out of the monthly figure", () => {
  // Entrar por padrão inflaria o faturamento com pedidos que o lojista não
  // consegue conferir na listagem do mês.
  const orders = [{ value: 150, created_at: "2026-08-02T10:00:00Z" }, { value: 9999 }];
  assert.equal(revenueInMonth(orders, MONTH), 150);
});

test("treats a missing value as zero instead of NaN", () => {
  const orders = [{ created_at: "2026-08-02T10:00:00Z" }, { value: 40, created_at: "2026-08-03T10:00:00Z" }];
  assert.equal(revenueInMonth(orders, MONTH), 40);
});

test("returns zero for a month with no orders", () => {
  assert.equal(revenueInMonth([], MONTH), 0);
  assert.equal(revenueInMonth([{ value: 10, created_at: "2026-01-01T00:00:00Z" }], MONTH), 0);
});

test("counts the orders backing the monthly figure", () => {
  const orders = [
    { value: 10, created_at: "2026-08-01T00:00:00Z" },
    { value: 20, created_at: "2026-08-09T00:00:00Z" },
    { value: 30, created_at: "2026-06-09T00:00:00Z" },
    { value: 40 },
  ];
  assert.equal(ordersInMonth(orders, MONTH).length, 2);
});

test("formats the current month as YYYY-MM", () => {
  assert.equal(currentMonth(new Date("2026-08-03T12:00:00Z")), "2026-08");
});
