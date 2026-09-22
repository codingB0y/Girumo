import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import { dayLabel, draftsForDay, funnelDays, repeatOptions } from "./funnel-days";
import { anchorFrom, planFunnel, type StepDraft } from "./funnel-plan";

const grade = getFunnelTemplate("grade-do-dia") as FunnelTemplate;
const foto = { id: "m1", name: "moletom.jpg", previewUrl: "blob:1" };
const base: Record<string, StepDraft> = {
  "grade-de-hoje": { fields: { "peça": "body manga longa", "preço": "R$ 29,90", grade: "1 ao 8", quantidade: "40" }, media: foto },
};

test("só Grade do dia repete", () => {
  assert.equal(grade.repeatable, true);
  for (const id of ["evento-2-dias", "live", "black-friday-atacado"] as const) {
    assert.equal(getFunnelTemplate(id)?.repeatable, undefined, id);
  }
});

test("os 6 dias seguintes à âncora, virando o mês", () => {
  assert.deepEqual(repeatOptions("2026-09-29"), [
    "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
  ]);
  assert.deepEqual(repeatOptions("lixo"), []);
});

test("dias do funil: âncora primeiro, marcados em ordem, fora da janela cai", () => {
  const marcados = ["2026-10-02", "2026-09-30", "2026-10-09", "2026-09-29"];
  assert.deepEqual(funnelDays("2026-09-29", marcados), ["2026-09-29", "2026-09-30", "2026-10-02"]);
  // Âncora andou para a frente: 30/09 ficou para trás e sai.
  assert.deepEqual(funnelDays("2026-10-01", marcados), ["2026-10-01", "2026-10-02"]);
});

test("rótulo do dia", () => {
  assert.equal(dayLabel("2026-09-30"), "qua 30/09");
});

test("dia extra herda tudo do 1º dia e troca só o que foi digitado", () => {
  const dia = draftsForDay(base, { "grade-de-hoje": { fields: { "peça": "conjunto moletom", quantidade: "30" } } });
  assert.deepEqual(dia["grade-de-hoje"].fields, {
    "peça": "conjunto moletom", "preço": "R$ 29,90", grade: "1 ao 8", quantidade: "30",
  });
  assert.equal(dia["grade-de-hoje"].media, foto);
});

test("campo apagado no dia extra volta para o valor do 1º dia", () => {
  const dia = draftsForDay(base, { "grade-de-hoje": { fields: { "peça": "  " } } });
  assert.equal(dia["grade-de-hoje"].fields?.["peça"], "body manga longa");
});

test("foto removida só no dia extra não some do 1º dia", () => {
  const dia = draftsForDay(base, { "grade-de-hoje": { media: undefined } });
  assert.equal(dia["grade-de-hoje"].media, undefined);
  assert.equal(base["grade-de-hoje"].media, foto);
});

test("o plano do dia extra sai completo, com a data dele", () => {
  const anchor = anchorFrom("2026-09-30", "", false) as Date;
  const plans = planFunnel(grade, draftsForDay(base, { "grade-de-hoje": { fields: { quantidade: "30" } } }), {
    anchor, now: new Date(2026, 8, 22, 12, 0), loja: "Mega Stock Kids", nicho: "moda infantil", link: "https://app.girumo.com.br/r/kids",
  });
  assert.equal(plans[0].at.getTime(), new Date(2026, 8, 30, 6, 0).getTime());
  assert.equal(
    plans[0].text,
    "Bom dia! Grade de hoje da Mega Stock Kids: body manga longa por R$ 29,90 no atacado, grade 1 ao 8. Só 30 peças. Quer? Manda *EU QUERO* aqui no grupo que eu separo a sua.",
  );
  assert.equal(plans[0].media, foto);
});
