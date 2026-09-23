import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import { draftsForDay } from "./funnel-days";
import { planFunnel, type FunnelContext } from "./funnel-plan";

const grade = getFunnelTemplate("grade-do-dia") as FunnelTemplate;
const evento = getFunnelTemplate("evento-2-dias") as FunnelTemplate;
const live = getFunnelTemplate("live") as FunnelTemplate;
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda infantil",
  link: "https://app.girumo.com.br/r/kids",
};
const hhmm = (d: Date) => `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

test("hora editada move só aquela etapa, no mesmo dia", () => {
  const plans = planFunnel(grade, { "ultimas-da-grade": { time: "14:30" } }, ctx);
  assert.deepEqual(plans.map((p) => hhmm(p.at)), ["10 6:00", "10 6:12", "10 14:30"]);
  assert.deepEqual(plans.map((p) => p.timeEdited), [false, false, true]);
});

test("hora editada vence a da praça; as outras seguem a praça", () => {
  const plans = planFunnel(grade, { "grade-de-hoje": { time: "07:15" } }, { ...ctx, opening: "08:00" });
  assert.deepEqual(plans.map((p) => hhmm(p.at)), ["10 7:15", "10 8:12", "10 12:00"]);
  assert.deepEqual(plans.map((p) => p.timeEdited), [true, false, false]);
});

test("etapa de véspera continua na véspera", () => {
  const previa = planFunnel(evento, { previa: { time: "21:00" } }, ctx)[1];
  assert.equal(hhmm(previa.at), "9 21:00");
});

test("etapa relativa à live vira hora fixa no dia da live", () => {
  const entra = planFunnel(live, { "entra-agora": { time: "19:40" } }, { ...ctx, anchor: new Date(2026, 9, 10, 20, 0) })[1];
  assert.equal(hhmm(entra.at), "10 19:40");
});

test("hora inválida é ignorada: volta a do roteiro", () => {
  for (const ruim of ["", "25:00", "7:00", "abc"]) {
    const p = planFunnel(grade, { "ultimas-da-grade": { time: ruim } }, ctx)[2];
    assert.equal(hhmm(p.at), "10 12:00", ruim);
    assert.equal(p.timeEdited, false, ruim);
  }
});

test("hora editada no passado desmarca a etapa", () => {
  const p = planFunnel(grade, { "ultimas-da-grade": { time: "05:00" } }, { ...ctx, now: new Date(2026, 9, 10, 5, 30) })[2];
  assert.equal(p.isPast, true);
  assert.equal(p.included, false);
});

test("dia repetido herda a hora editada do 1º dia e pode trocar a dele", () => {
  const base = { "ultimas-da-grade": { time: "14:30" } };
  const herdado = planFunnel(grade, draftsForDay(base, {}), ctx)[2];
  assert.equal(hhmm(herdado.at), "10 14:30");
  const trocado = planFunnel(grade, draftsForDay(base, { "ultimas-da-grade": { time: "15:00" } }), ctx)[2];
  assert.equal(hhmm(trocado.at), "10 15:00");
});
