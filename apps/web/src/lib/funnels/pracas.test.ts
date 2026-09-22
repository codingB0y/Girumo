import assert from "node:assert/strict";
import { test } from "node:test";
import { planFunnel } from "@/components/painel/messages/funnel/funnel-plan";
import { PRACAS, ROTEIRO_OPENING, atOpening, isValidOpening, openingOf } from "./pracas";
import { FUNNEL_TEMPLATES, getFunnelTemplate, type FunnelTemplate } from "./templates";

const grade = getFunnelTemplate("grade-do-dia") as FunnelTemplate;
const evento = getFunnelTemplate("evento-2-dias") as FunnelTemplate;
const ctx = {
  anchor: new Date(2026, 9, 10),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda infantil",
  link: "https://app.girumo.com.br/r/kids",
};
const horas = (t: FunnelTemplate, opening?: string) =>
  planFunnel(t, {}, { ...ctx, opening }).map((p) => `${p.at.getDate()} ${p.at.getHours()}:${String(p.at.getMinutes()).padStart(2, "0")}`);

test("Brás é o roteiro como está escrito", () => {
  assert.equal(openingOf("bras", ""), ROTEIRO_OPENING);
  assert.deepEqual(horas(grade, "06:00"), horas(grade));
  assert.deepEqual(horas(grade), ["10 6:00", "10 6:12", "10 12:00"]);
});

test("Bom Retiro e Região da 44 abrem 08:00; o link das vagas anda junto, o meio-dia fica", () => {
  assert.equal(openingOf("bom-retiro", ""), "08:00");
  assert.equal(openingOf("regiao-44", ""), "08:00");
  assert.deepEqual(horas(grade, "08:00"), ["10 8:00", "10 8:12", "10 12:00"]);
});

test("Outro horário usa o que foi digitado", () => {
  assert.equal(openingOf("outra", "07:30"), "07:30");
  assert.deepEqual(horas(grade, "07:30"), ["10 7:30", "10 7:42", "10 12:00"]);
});

test("evento: as duas aberturas andam, véspera 19:00 e meio-dia ficam", () => {
  assert.deepEqual(horas(evento, "08:00"), ["8 19:00", "9 19:00", "10 8:00", "10 12:00", "11 8:00", "11 18:00", "12 10:00"]);
});

test("a copy diz a hora da praça, não 06:00", () => {
  const previa = planFunnel(evento, { previa: { fields: { "peça": "body", "preço": "R$ 29,90", grade: "1 ao 8" } } }, { ...ctx, opening: "08:00" })[1];
  assert.equal(previa.text, "Amanhã 08:00 abre. Prévia: body a partir de R$ 29,90, grade 1 ao 8. Quem estiver no grupo às 08:00 pega primeiro.");
});

test("só etapa presa à abertura anda", () => {
  for (const t of FUNNEL_TEMPLATES) {
    for (const s of t.steps) {
      const movida = atOpening(s, "08:00");
      if (s.followsOpening) assert.notEqual(movida.at.time, s.at.time, `${t.id}/${s.id}`);
      else assert.equal(movida, s, `${t.id}/${s.id}`);
      // Presa à abertura = exatamente as etapas da madrugada do roteiro.
      assert.equal(Boolean(s.followsOpening), Boolean(s.at.time?.startsWith("06:")), `${t.id}/${s.id}`);
    }
  }
});

test("abertura válida: HH:MM até 11:00", () => {
  for (const ok of ["00:00", "06:00", "08:30", "11:00"]) assert.equal(isValidOpening(ok), true, ok);
  for (const ruim of ["11:01", "13:00", "8:00", "", "24:00", "07:60"]) assert.equal(isValidOpening(ruim), false, ruim);
});

test("toda praça com hora fixa tem hora válida", () => {
  for (const p of PRACAS) if (p.opening) assert.equal(isValidOpening(p.opening), true, p.id);
});
