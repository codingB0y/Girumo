import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import {
  anchorFrom, blockerLabels, defaultAnchorDate, isBlocked, messagePayload, offerPayload,
  planFunnel, stepWhen, type FunnelContext, type StepDraft,
} from "./funnel-plan";

const live = getFunnelTemplate("live") as FunnelTemplate;
const grade = getFunnelTemplate("grade-do-dia") as FunnelTemplate;
const bf = getFunnelTemplate("black-friday-atacado") as FunnelTemplate;

// Sábado 10/10/2026 20:00 local; "agora" bem antes.
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10, 20, 0),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda feminina",
  link: "https://app.girumo.com.br/r/saldao",
};
const cheio: Record<string, StepDraft> = {
  "previa-da-grade": { fields: { "peça": "vestido midi", "preço": "R$ 39,90", grade: "P ao GG", quantidade: "120" } },
  "entra-agora": { fields: { "link da live": "instagram.com/mega/live" } },
};

test("renderiza a prévia da Live com loja, nicho e hora da âncora", () => {
  const [previa] = planFunnel(live, cheio, ctx);
  assert.equal(
    previa.text,
    "Amanhã 20h tem live da Mega Stock! Prévia da grade de moda feminina: vestido midi a partir de R$ 39,90 no atacado, grade P ao GG, 120 peças. Quem estiver ao vivo leva condição exclusiva.",
  );
  assert.equal(previa.missing.length, 0);
});

test("a grade da live herda peça/preço/grade/quantidade da prévia", () => {
  const plans = planFunnel(live, cheio, ctx);
  const gradeDaLive = plans[2];
  assert.equal(gradeDaLive.step.id, "grade-da-live");
  assert.equal(gradeDaLive.values["peça"], "vestido midi");
  assert.equal(isBlocked(gradeDaLive), false);
});

test("valor da própria etapa vence o herdado", () => {
  const drafts = { ...cheio, "grade-da-live": { fields: { "peça": "conjunto" } } };
  const plans = planFunnel(live, drafts, ctx);
  assert.equal(plans[2].values["peça"], "conjunto");
  assert.equal(plans[0].values["peça"], "vestido midi");
});

test("loja vazia bloqueia mesmo sem campo da etapa faltando (gate por missingKeys)", () => {
  const plans = planFunnel(live, cheio, { ...ctx, loja: "  " });
  assert.ok(plans[0].missing.includes("loja"));
  assert.equal(isBlocked(plans[0]), true);
  assert.equal(plans[0].text, null);
  assert.ok(blockerLabels(plans[0]).includes("Sua loja"));
  // "Entra agora" não usa {loja}: não bloqueia.
  assert.equal(isBlocked(plans[1]), false);
});

test("link da campanha vazio bloqueia as etapas de link", () => {
  const plans = planFunnel(live, cheio, { ...ctx, link: "" });
  const sobras = plans[3];
  assert.equal(sobras.step.id, "sobras-da-live");
  assert.deepEqual(sobras.missing, ["link"]);
  assert.ok(blockerLabels(sobras).includes("link da campanha"));
});

test("quantidade precisa ser inteiro ≥ 1", () => {
  for (const q of ["0", "1,5", "12a", "-3"]) {
    const drafts = { ...cheio, "previa-da-grade": { fields: { ...cheio["previa-da-grade"].fields, quantidade: q } } };
    const plans = planFunnel(live, drafts, ctx);
    const [previa] = plans;
    assert.equal(previa.quantidadeInvalida, true, q);
    assert.equal(isBlocked(previa), true, q);
    // A grade da live (relâmpago) herda a quantidade inválida: vira `slots`, tem que travar.
    assert.equal(plans[2].step.id, "grade-da-live");
    assert.equal(plans[2].quantidadeInvalida, true, q);
    assert.equal(isBlocked(plans[2]), true, q);
  }
});

test("etapa relâmpago com texto editado sem {quantidade} ainda exige quantidade (vira slots)", () => {
  const drafts: Record<string, StepDraft> = {
    ...cheio,
    "previa-da-grade": { fields: { "peça": "x", "preço": "y", grade: "z" } },
    "grade-da-live": { customText: "Liberado! Manda EU QUERO." },
  };
  const plans = planFunnel(live, drafts, ctx);
  assert.ok(plans[2].missing.includes("quantidade"));
});

test("texto editado prevalece e não é regenerado pelos campos", () => {
  const drafts = { ...cheio, "sobras-da-live": { customText: "Sobrou pouco, corre." } };
  const plans = planFunnel(live, drafts, ctx);
  assert.equal(plans[3].edited, true);
  assert.equal(plans[3].text, "Sobrou pouco, corre.");
});

test("texto editado vazio bloqueia", () => {
  const plans = planFunnel(live, { ...cheio, "sobras-da-live": { customText: "  " } }, ctx);
  assert.deepEqual(plans[3].missing, ["texto"]);
});

test("etapa no passado fica desmarcada; as outras não", () => {
  // Agora = sábado 19:50: a prévia (sexta 19:00) e o "Entra agora" (19:45) já passaram.
  const plans = planFunnel(live, cheio, { ...ctx, now: new Date(2026, 9, 10, 19, 50) });
  assert.deepEqual(plans.map((p) => p.included), [false, false, true, true]);
  assert.deepEqual(plans.map((p) => p.isPast), [true, true, false, false]);
});

test("etapa exatamente no horário de agora já conta como passada", () => {
  // Âncora 20:00; "Entra agora" é 19:45 — igual a `now`.
  const plans = planFunnel(live, cheio, { ...ctx, now: new Date(2026, 9, 10, 19, 45) });
  assert.equal(plans[1].step.id, "entra-agora");
  assert.equal(plans[1].isPast, true);
  assert.equal(plans[1].included, false);
});

test("chave com nome de propriedade de Object.prototype não derruba a tela", () => {
  const drafts = { ...cheio, "sobras-da-live": { customText: "Oi {constructor} {__proto__} {toString}" } };
  const plans = planFunnel(live, drafts, ctx);
  assert.deepEqual(plans[3].missing, ["constructor", "__proto__", "toString"]);
  assert.equal(plans[3].text, null);
  assert.equal(plans[3].preview, "Oi [constructor] [__proto__] [toString]");
});

test("etapa passada não bloqueia o botão mesmo com campo vazio", () => {
  const plans = planFunnel(live, {}, { ...ctx, now: new Date(2026, 9, 12, 0, 0) });
  assert.equal(plans.some(isBlocked), false);
});

test("desmarcar à mão exclui", () => {
  const plans = planFunnel(live, { ...cheio, "entra-agora": { ...cheio["entra-agora"], excluded: true } }, ctx);
  assert.equal(plans[1].included, false);
});

test("prévia mostra [chave] no lugar do que falta", () => {
  const [previa] = planFunnel(live, {}, ctx);
  assert.match(previa.preview, /\[peça\] a partir de \[preço\]/);
});

test("mentionAll vem do roteiro e o lojista pode trocar", () => {
  assert.equal(planFunnel(live, cheio, ctx)[1].mentionAll, true);
  assert.equal(planFunnel(live, { ...cheio, "entra-agora": { ...cheio["entra-agora"], mentionAll: false } }, ctx)[1].mentionAll, false);
});

test("payload da mensagem: agendada, sem recorrência, com o par do funil", () => {
  const plans = planFunnel(live, cheio, ctx);
  const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", groupIds: ["g1", "g2"] };
  const p = messagePayload(plans[2], run);
  assert.equal(p.recurrence, "none");
  assert.equal(p.scheduledAt, new Date(2026, 9, 10, 21, 30).toISOString());
  assert.equal(p.funnelTemplateId, "live");
  assert.equal(p.funnelRunId, run.runId);
  assert.deepEqual(p.groupIds, ["g1", "g2"]);
  assert.equal("mediaId" in p, false);
});

test("payload leva a foto quando anexada", () => {
  const drafts = { ...cheio, "grade-da-live": { media: { id: "m1", name: "vestido.jpg", previewUrl: "blob:x" } } };
  const p = messagePayload(planFunnel(live, drafts, ctx)[2], { templateId: "live", runId: "r", groupIds: ["g"] });
  assert.equal(p.mediaId, "m1");
  assert.equal(p.mediaType, "image");
  assert.equal(p.mediaName, "vestido.jpg");
});

test("payload recusa etapa incompleta em vez de mandar chave crua", () => {
  const [previa] = planFunnel(live, {}, ctx);
  assert.throws(() => messagePayload(previa, { templateId: "live", runId: "r", groupIds: ["g"] }));
});

test("payload da oferta: nome da etapa, 'eu quero', slots inteiros", () => {
  const plans = planFunnel(live, cheio, ctx);
  assert.deepEqual(offerPayload(plans[2], "b-3"), { name: "Grade da live", keyword: "eu quero", slots: 120, broadcastId: "b-3" });
});

test("payload da oferta recusa quantidade que não é inteiro ≥ 1 (nada de slots NaN)", () => {
  for (const q of ["", "0", "1,5", "abc"]) {
    const drafts = { ...cheio, "previa-da-grade": { fields: { ...cheio["previa-da-grade"].fields, quantidade: q } } };
    assert.throws(() => offerPayload(planFunnel(live, drafts, ctx)[2], "b"), q);
  }
});

test("stepWhen formata dia da semana, data e hora", () => {
  assert.equal(stepWhen(new Date(2026, 9, 9, 19, 0)), "sex 09/10 · 19:00");
  assert.equal(stepWhen(new Date(2026, 9, 11, 6, 5)), "dom 11/10 · 06:05");
});

test("âncora: data inválida dá null; sem hora usa meia-noite", () => {
  assert.equal(anchorFrom("", "20:00", true), null);
  assert.equal(anchorFrom("2026-10-10", "", true), null);
  assert.equal(anchorFrom("2026-10-10", "", false)?.getHours(), 0);
  assert.equal(anchorFrom("2026-10-10", "20:30", true)?.getMinutes(), 30);
});

test("âncora padrão: amanhã; BF usa a sugestão do roteiro", () => {
  assert.equal(defaultAnchorDate(grade, new Date(2026, 9, 1, 15, 0)), "2026-10-02");
  assert.equal(defaultAnchorDate(bf, new Date(2026, 9, 1, 15, 0)), "2026-11-06");
});
