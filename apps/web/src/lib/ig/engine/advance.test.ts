import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import { advance, type Deps, type RunState } from "./advance";

const comConvite = (def: FlowDef, slug = "vip"): FlowDef => ({ ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: slug } : n)) });
const agora = () => new Date("2026-10-06T12:00:00Z");
const base: RunState = { id: "run-1", flowId: "f1", ref: "ref123456789", sourceKind: "comment", providerAccountId: "z1", comment: { platformPostId: "post", commentId: "com" }, conversationId: null, windowExpiresAt: "2026-10-13T12:00:00Z", directsSent: 0 };

function montar(opts: Parameters<typeof createFakeTransport>[0] = {}) {
  const { transport, chamadas } = createFakeTransport(opts);
  const passos: Array<[string, FlowOut]> = [];
  const deps: Deps = { transport, now: agora, link: async (slug, ref) => `https://app/r/${slug}?ig=${ref}`, step: async (n, o) => { passos.push([n, o]); } };
  return { deps, chamadas, passos };
}

test("comentou, entra no grupo: resposta pública, uma privada com o link no fim, run termina", async () => {
  const { deps, chamadas, passos } = montar();
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, deps);
  assert.equal(r.status, "done");
  assert.equal(r.directsSent, 1);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
  const privada = chamadas[1];
  assert.ok(privada.metodo === "privateReply");
  assert.equal(privada.args.message, "Oi! Aqui está o link do grupo VIP:\nhttps://app/r/vip?ig=ref123456789");
  assert.equal(privada.args.idempotencyKey, "run-1:convite");
  assert.deepEqual(privada.args, { ...privada.args, accountId: "z1", platformPostId: "post", commentId: "com" });
  assert.deepEqual(passos, [["gatilho", "next"]]);
});

test("pediu no direct: nada de resposta pública; o direct vai na conversa", async () => {
  const { deps, chamadas } = montar();
  const def = comConvite({ ...RECIPES.dm_invite.build() });
  const r = await advance(def, { ...base, sourceKind: "dm", comment: null, conversationId: "conv-9", windowExpiresAt: "2026-10-07T12:00:00Z" }, deps);
  assert.equal(r.status, "done");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  assert.ok(chamadas[0].metodo === "sendMessage" && chamadas[0].args.conversationId === "conv-9");
});

test("resposta privada já gasta (reenvio) conta como enviada; erro fixo marca falha com o código; passageiro estoura", async () => {
  const gasta = new ZernioError(400, "invalid_request_error", "private_reply_consumed", { privateReplyConsumed: true }, "spent");
  assert.equal((await advance(comConvite(RECIPES.comment_invite.build()), base, montar({ falhar: { privateReply: gasta } }).deps)).status, "done");

  const recusa = new ZernioError(400, "platform_error", "platform_api_error", null, "Meta disse não");
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, montar({ falhar: { privateReply: recusa } }).deps);
  assert.equal(r.status, "failed");
  assert.equal(r.errorCode, "platform_api_error");
  assert.equal(r.nodeId, "convite");

  const fora = new ZernioError(502, "platform_error", "platform_api_error", null, "upstream");
  await assert.rejects(() => advance(comConvite(RECIPES.comment_invite.build()), base, montar({ falhar: { privateReply: fora } }).deps), (e: unknown) => e instanceof ZernioError && e.transient);
});

test("a resposta pública falhar não para o run", async () => {
  const recusa = new ZernioError(400, "platform_error", "platform_api_error", null, "sem permissão de comentário");
  const { deps, chamadas } = montar({ falhar: { publicReply: recusa } });
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, deps);
  assert.equal(r.status, "done");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
});

test("janela fechada: nada sai; segundo direct depois de comentário sem conversa: falha no_conversation", async () => {
  const { deps, chamadas } = montar();
  const vencido = await advance(comConvite(RECIPES.comment_invite.build()), { ...base, windowExpiresAt: "2026-10-06T11:59:59Z" }, deps);
  assert.equal(vencido.status, "failed");
  assert.equal(vencido.errorCode, "window_expired");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply"]);

  const doisDirects: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "m1", type: "message", text: "Oi", button: null, wait: null },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "m1" }, { from: "m1", out: "next", to: "convite" }],
  };
  const r = await advance(doisDirects, base, montar().deps);
  assert.equal(r.status, "failed");
  assert.equal(r.errorCode, "no_conversation");
  assert.equal(r.nodeId, "convite");
  assert.equal(r.directsSent, 1);
});

test("espera por resposta e desvio por clique deixam o run ativo pra fase 3; ciclo para em 2 visitas", async () => {
  const espera: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "pede", type: "message", text: "Me responde", button: null, wait: { minutes: 60 } },
    ],
    edges: [{ from: "gatilho", out: "next", to: "pede" }],
  };
  const dm = { ...base, sourceKind: "dm" as const, comment: null, conversationId: "conv" };
  const r1 = await advance(espera, dm, montar().deps);
  assert.deepEqual([r1.status, r1.waiting, r1.nodeId], ["active", "reply", "pede"]);

  const lembrete = comConvite({ ...RECIPES.dm_invite.build(), nodes: RECIPES.dm_invite.build().nodes.map((n) => (n.type === "invite" ? { ...n, remindAfterMinutes: 60 } : n)) });
  const r2 = await advance(lembrete, dm, montar().deps);
  assert.deepEqual([r2.status, r2.waiting], ["active", "click"]);

  const ciclo: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "a", type: "message", text: "A", button: null, wait: null },
      { id: "b", type: "message", text: "B", button: null, wait: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "a" }, { from: "a", out: "next", to: "b" }, { from: "b", out: "next", to: "a" }],
  };
  const { deps, chamadas } = montar();
  const r3 = await advance(ciclo, dm, deps);
  assert.equal(r3.status, "failed");
  assert.equal(r3.errorCode, "cycle");
  assert.equal(chamadas.length, 4, "a, b, a, b e para antes da terceira visita");
});

/** Comentário → pergunta que espera "sim" → convite com botão de link. */
const confirma: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: "Te chamei no direct.", storyReplies: false },
    { id: "pergunta", type: "message", text: "Quer o link do grupo? Responde SIM.", button: null, wait: { minutes: 1380, keywords: ["sim"] } },
    { id: "convite", type: "invite", text: "Clique no botão abaixo e entre no grupo VIP.", campaignSlug: "vip", button: "Entrar no grupo VIP", remindAfterMinutes: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "pergunta" }, { from: "pergunta", out: "replied", to: "convite" }],
};

test("confirmação: o comentário recebe só a pergunta (texto puro) e o run espera a resposta até a hora marcada", async () => {
  const { deps, chamadas } = montar();
  const r = await advance(confirma, base, deps);
  assert.deepEqual([r.status, r.waiting, r.nodeId, r.directsSent, r.wakeAt], ["active", "reply", "pergunta", 1, "2026-10-07T11:00:00.000Z"]);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
  assert.ok(chamadas[1].metodo === "privateReply" && chamadas[1].args.message === "Quer o link do grupo? Responde SIM.");
});

test("retomada depois do 'sim': o convite sai na conversa com o link no botão, sem link no texto, e o run termina", async () => {
  const { deps, chamadas, passos } = montar();
  const r = await advance(confirma, { ...base, conversationId: "conv-7", directsSent: 1 }, deps, { nodeId: "pergunta", out: "replied" });
  assert.deepEqual([r.status, r.nodeId, r.wakeAt], ["done", "convite", null]);
  assert.deepEqual(passos, [["pergunta", "replied"]]);
  assert.equal(chamadas.length, 1, "sem resposta pública de novo");
  const envio = chamadas[0];
  assert.ok(envio.metodo === "sendMessage");
  assert.deepEqual(envio.args, {
    accountId: "z1",
    conversationId: "conv-7",
    message: "Clique no botão abaixo e entre no grupo VIP.",
    buttons: [{ type: "url", title: "Entrar no grupo VIP", url: "https://app/r/vip?ig=ref123456789" }],
    idempotencyKey: "run-1:convite",
  });
});

test("botão em direct de conversa vira postback com o id do bloco; na resposta privada o link volta pro texto", async () => {
  const dmDef: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "pergunta", type: "message", text: "Quer o link?", button: "Sim, quero", wait: { minutes: 60 } },
    ],
    edges: [{ from: "gatilho", out: "next", to: "pergunta" }],
  };
  const { deps, chamadas } = montar();
  await advance(dmDef, { ...base, sourceKind: "dm", comment: null, conversationId: "conv" }, deps);
  assert.ok(chamadas[0].metodo === "sendMessage");
  assert.deepEqual(chamadas[0].args.buttons, [{ type: "postback", title: "Sim, quero", payload: "pergunta" }]);

  // Fluxo que a validação recusaria (botão no único direct do comentário): o motor manda o link no texto, nunca perde o convite.
  const direto: FlowDef = { ...confirma, nodes: confirma.nodes.filter((n) => n.id !== "pergunta"), edges: [{ from: "gatilho", out: "next", to: "convite" }] };
  const m = montar();
  await advance(direto, base, m.deps);
  const privada = m.chamadas[1];
  assert.ok(privada.metodo === "privateReply");
  assert.equal(privada.args.message, "Clique no botão abaixo e entre no grupo VIP.\nhttps://app/r/vip?ig=ref123456789");
});
