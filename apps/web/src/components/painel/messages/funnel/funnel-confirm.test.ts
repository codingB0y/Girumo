import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import { planFunnel, type FunnelContext, type StepDraft } from "./funnel-plan";
import { EMPTY_PROGRESS, confirmFunnel, isStepDone, type PostJson } from "./funnel-confirm";

const live = getFunnelTemplate("live") as FunnelTemplate;
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10, 20, 0),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda feminina",
  link: "https://app.girumo.com.br/r/saldao",
};
const drafts: Record<string, StepDraft> = {
  "previa-da-grade": { fields: { "peça": "vestido midi", "preço": "R$ 39,90", grade: "P ao GG", quantidade: "120" } },
  "entra-agora": { fields: { "link da live": "instagram.com/mega/live" } },
};
const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", groupIds: ["g1"] };

type Chamada = { url: string; body: Record<string, unknown> };

/** `falhas`: índice da chamada (0-based) → resposta de erro. */
function postFalso(falhas: Record<number, Response> = {}) {
  const chamadas: Chamada[] = [];
  let msg = 0;
  const post: PostJson = async (url, body) => {
    const i = chamadas.length;
    chamadas.push({ url, body: body as Record<string, unknown> });
    if (falhas[i]) return falhas[i];
    if (url.endsWith("/messages")) {
      msg += 1;
      return Response.json({ id: `b-${msg}` }, { status: 201 });
    }
    return Response.json({ offer: { id: "o-1" } }, { status: 201 });
  };
  return { post, chamadas };
}

test("em série: mensagem antes da oferta, oferta ligada ao broadcast da própria etapa", async () => {
  const { post, chamadas } = postFalso();
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(out.failure, null);
  assert.deepEqual(
    chamadas.map((c) => c.url),
    [
      "/api/campanhas/saldao/messages",
      "/api/campanhas/saldao/messages",
      "/api/campanhas/saldao/messages",
      "/api/relampago/offers",
      "/api/campanhas/saldao/messages",
    ],
  );
  assert.equal(chamadas[3].body.broadcastId, "b-3");
  assert.equal(chamadas[3].body.slots, 120);
  const mensagens = chamadas.filter((c) => c.url.endsWith("/messages"));
  assert.ok(mensagens.every((c) => c.body.funnelRunId === run.runId && c.body.recurrence === "none" && typeof c.body.scheduledAt === "string"));
  assert.deepEqual(out.progress.scheduled, { "previa-da-grade": "b-1", "entra-agora": "b-2", "grade-da-live": "b-3", "sobras-da-live": "b-4" });
  assert.deepEqual(out.progress.offersCreated, ["grade-da-live"]);
});

test("para na primeira mensagem que falha e diz qual", async () => {
  const erro = Response.json({ error: "WhatsApp desconectado. Reconecte em Conexão antes de disparar." }, { status: 409 });
  const { post, chamadas } = postFalso({ 0: erro });
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.length, 1);
  assert.deepEqual(out.progress.scheduled, {});
  assert.equal(out.failure?.stepId, "previa-da-grade");
  assert.equal(out.failure?.stage, "mensagem");
  assert.match(out.failure?.message ?? "", /WhatsApp desconectado/);
});

test("oferta falhou: a mensagem fica registrada e retomar cria SÓ a oferta, sem duplicar", async () => {
  const primeira = postFalso({ 3: Response.json({ error: "grupo ocupado" }, { status: 400 }) });
  const plans = planFunnel(live, drafts, ctx);
  const out = await confirmFunnel({ slug: "saldao", plans, run, progress: EMPTY_PROGRESS, post: primeira.post });
  assert.equal(out.failure?.stage, "oferta");
  assert.equal(out.failure?.stepId, "grade-da-live");
  assert.equal(out.progress.scheduled["grade-da-live"], "b-3");
  assert.deepEqual(out.progress.offersCreated, []);

  const segunda = postFalso();
  const retomada = await confirmFunnel({ slug: "saldao", plans, run, progress: out.progress, post: segunda.post });
  assert.equal(retomada.failure, null);
  assert.deepEqual(segunda.chamadas.map((c) => c.url), ["/api/relampago/offers", "/api/campanhas/saldao/messages"]);
  assert.equal(segunda.chamadas[0].body.broadcastId, "b-3");
});

test("etapa desmarcada ou passada não é enviada", async () => {
  const { post, chamadas } = postFalso();
  const plans = planFunnel(live, { ...drafts, "entra-agora": { ...drafts["entra-agora"], excluded: true } }, ctx);
  await confirmFunnel({ slug: "saldao", plans, run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.filter((c) => c.url.endsWith("/messages")).length, 3);
});

test("isStepDone: relâmpago só está feito com mensagem E oferta", () => {
  const [, , grade] = planFunnel(live, drafts, ctx);
  assert.equal(isStepDone(grade, { scheduled: { "grade-da-live": "b" }, offersCreated: [] }), false);
  assert.equal(isStepDone(grade, { scheduled: { "grade-da-live": "b" }, offersCreated: ["grade-da-live"] }), true);
});

test("não muta o progress recebido", async () => {
  const progress = { scheduled: { "previa-da-grade": "b-0" }, offersCreated: [] as string[] };
  const congelado = structuredClone(progress);
  await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress, post: postFalso().post });
  assert.deepEqual(progress, congelado);
});

test("post que rejeita (rede) na 2ª mensagem vira falha com o progress até ali", async () => {
  const chamadas: string[] = [];
  const post: PostJson = async (url) => {
    chamadas.push(url);
    if (chamadas.length === 2) throw new TypeError("Failed to fetch");
    return Response.json({ id: `b-${chamadas.length}` }, { status: 201 });
  };
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.length, 2);
  assert.deepEqual(out.progress.scheduled, { "previa-da-grade": "b-1" });
  assert.equal(out.failure?.stepId, "entra-agora");
  assert.equal(out.failure?.stage, "mensagem");
  assert.equal(out.failure?.message, "Sem conexão com o servidor. Confira a Agenda antes de tentar de novo.");
  assert.equal(out.failure?.upgradeUrl, null);
});

test("quantidade inválida chegando ao confirm: falha na oferta, mensagem da etapa registrada, nenhum POST de oferta", async () => {
  const { post, chamadas } = postFalso();
  const ruim = { ...drafts, "previa-da-grade": { fields: { ...drafts["previa-da-grade"].fields, quantidade: "12,5" } } };
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, ruim, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(out.failure?.stepId, "grade-da-live");
  assert.equal(out.failure?.stage, "oferta");
  assert.equal(out.progress.scheduled["grade-da-live"], "b-3");
  assert.deepEqual(out.progress.offersCreated, []);
  assert.equal(chamadas.filter((c) => c.url === "/api/relampago/offers").length, 0);
  assert.equal(chamadas.length, 3);
});

test("retomada: oferta já criada no servidor (409 do rascunho) conta como feita e o funil segue", async () => {
  const { post, chamadas } = postFalso({ 0: Response.json({ error: "esse disparo ja tem uma oferta ligada" }, { status: 409 }) });
  const progress = { scheduled: { "previa-da-grade": "b-1", "entra-agora": "b-2", "grade-da-live": "b-3" }, offersCreated: [] };
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress, post });
  assert.equal(out.failure, null);
  assert.deepEqual(out.progress.offersCreated, ["grade-da-live"]);
  assert.deepEqual(chamadas.map((c) => c.url), ["/api/relampago/offers", "/api/campanhas/saldao/messages"]);
  assert.equal(out.progress.scheduled["sobras-da-live"], "b-1");
});

test("2xx de mensagem sem id: para e manda conferir a Agenda", async () => {
  const { post, chamadas } = postFalso({ 0: Response.json({}, { status: 201 }) });
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.length, 1);
  assert.equal(out.failure?.stepId, "previa-da-grade");
  assert.equal(out.failure?.stage, "mensagem");
  assert.match(out.failure?.message ?? "", /^A mensagem pode ter sido agendada/);
  assert.deepEqual(out.progress.scheduled, {});
});

test("402 do plano leva o upgradeUrl para a falha", async () => {
  const erro = Response.json({ error: "Seu plano não inclui agendar mensagem.", upgradeUrl: "/painel/plano" }, { status: 402 });
  const { post } = postFalso({ 0: erro });
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(out.failure?.upgradeUrl, "/painel/plano");
  assert.equal(out.failure?.message, "Seu plano não inclui agendar mensagem.");
});

test("slug vai codificado na URL da mensagem", async () => {
  const { post, chamadas } = postFalso();
  const slug = "saldão de set";
  await confirmFunnel({ slug, plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas[0].url, `/api/campanhas/${encodeURIComponent(slug)}/messages`);
  assert.notEqual(chamadas[0].url, `/api/campanhas/${slug}/messages`);
});

test("etapa incompleta incluída: falha na mensagem sem POST nenhum", async () => {
  const { post, chamadas } = postFalso();
  const semPeca = { ...drafts, "previa-da-grade": { fields: { ...drafts["previa-da-grade"].fields, "peça": "" } } };
  const plans = planFunnel(live, semPeca, ctx);
  assert.ok(plans[0].included && plans[0].text === null);
  const out = await confirmFunnel({ slug: "saldao", plans, run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.length, 0);
  assert.equal(out.failure?.stepId, "previa-da-grade");
  assert.equal(out.failure?.stage, "mensagem");
  assert.equal(out.failure?.upgradeUrl, null);
});
