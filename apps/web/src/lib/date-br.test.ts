import test from "node:test";
import assert from "node:assert/strict";
import { dayBR, monthBR, dayBRAgo, dayBROf, monthBROf, horaBR } from "./date-br";

/**
 * 31/08/2026 às 23h30 em Brasília = 01/09/2026 às 02h30 UTC.
 *
 * Este é o instante que quebrava o painel: `toISOString()` devolvia
 * "2026-09-01", então às 21h o contador de "hoje" zerava com movimento
 * acontecendo — e na virada do mês o faturamento do mês inteiro sumia da tela
 * três horas antes da hora.
 */
const NOITE_DE_31 = new Date("2026-08-31T23:30:00-03:00");

test("as 23h30 de Brasília ainda é o mesmo dia, não o seguinte", () => {
  assert.equal(dayBR(NOITE_DE_31), "2026-08-31");
});

test("o mês não vira na noite do último dia", () => {
  assert.equal(monthBR(NOITE_DE_31), "2026-08");
});

test("depois da meia-noite de Brasília já é o dia novo", () => {
  assert.equal(dayBR(new Date("2026-09-01T00:30:00-03:00")), "2026-09-01");
});

test("ontem, olhado às 23h30 do dia 31, é o dia 30", () => {
  assert.equal(dayBRAgo(1, NOITE_DE_31), "2026-08-30");
});

test("timestamp UTC do banco é convertido para o dia de Brasília", () => {
  // Revendedora que entrou 01/09 00h30 UTC entrou 31/08 21h30 em SP.
  // Ela conta para o dia 31 — é quando o lojista viu a entrada acontecer.
  assert.equal(dayBROf("2026-09-01T00:30:00Z"), "2026-08-31");
  assert.equal(monthBROf("2026-09-01T00:30:00Z"), "2026-08");
});

test("data sem hora é lida como o próprio dia, sem deslocar para trás", () => {
  // `new Date("2026-08-31")` é meia-noite UTC = 30/08 21h em SP. Sem este
  // caminho, uma data pura andaria um dia para trás.
  assert.equal(dayBROf("2026-08-31"), "2026-08-31");
});

test("a hora é a do relógio do lojista, não a do servidor", () => {
  // 02h30 UTC é 23h30 do dia anterior em Brasília. O painel diz "última às
  // 23:30" porque foi quando o lojista viu o disparo sair.
  assert.equal(horaBR("2026-09-01T02:30:00Z"), "23:30");
  assert.equal(horaBR("2026-08-31T12:00:00Z"), "09:00");
});

test("hora ausente ou inválida vira string vazia, não Invalid Date", () => {
  assert.equal(horaBR(undefined), "");
  assert.equal(horaBR(null), "");
  assert.equal(horaBR("sem hora"), "");
});

test("valor ausente ou não-data não vira data", () => {
  assert.equal(dayBROf(undefined), undefined);
  assert.equal(dayBROf(null), undefined);
  assert.equal(dayBROf(""), undefined);
  assert.equal(dayBROf("sem data"), undefined);
  assert.equal(monthBROf(undefined), undefined);
});
