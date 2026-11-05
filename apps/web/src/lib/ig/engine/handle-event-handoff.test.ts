import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowDef } from "@/lib/ig/flow/types";
import type { RunRow } from "@/lib/stores/ig-runs";
import { ambiente, comentario, direct, T0 } from "./ambiente-falso";
import { tratarEvento, type Ambiente } from "./handle-event";

// Bloco Passar pra loja (spec §4.4, §7.3): texto, run encerrado, Aguardando você e robô pausado por 24 h.

const gatilho = (on: "comment" | "dm") => ({ id: "gatilho", type: "trigger" as const, on, keywords: ["quero"], postId: null, publicReply: null, storyReplies: false });
const comPergunta: FlowDef = {
  v: 1,
  nodes: [
    gatilho("comment"),
    { id: "q", type: "message", text: "Quer o link do grupo?", button: null, wait: { minutes: 1380 }, choices: ["Sim, quero"] },
    { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
    { id: "loja", type: "handoff", text: "Já já alguém da loja te responde por aqui." },
  ],
  edges: [{ from: "gatilho", out: "next", to: "q" }, { from: "q", out: "v0", to: "convite" }, { from: "q", out: "other", to: "loja" }],
};
const flux = (def: FlowDef): Ambiente["fluxosNoAr"] => async () => [{ id: "f-loja", version: 1, published: def }];
const esperando: RunRow = { id: "run-esp", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-loja", flow_version: 1, source_kind: "comment", source_id: "c-1", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "ref-esp", status: "active", node_id: "q", waiting: "reply", wake_at: "2026-10-07T11:00:00Z", window_expires_at: "2026-10-13T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T11:00:00Z", updated_at: "2026-10-06T11:00:01Z", finished_at: null };
const outra = { ...direct, message: { ...direct.message, platformMessageId: "m-outra", text: "o que é isso?" } };
const diaSeguinte = new Date(T0.getTime() + 24 * 3_600_000).toISOString();

test("resposta que cai no outro: manda o texto, encerra o run, conversa em Aguardando você e robô pausado 24 h", async () => {
  const { amb, chamadas, patches, indice } = ambiente({ fluxos: flux(comPergunta), esperando });
  assert.deepEqual(await tratarEvento(outra, amb), { kind: "handled", tenantId: "loja-a", runId: "run-esp", status: "done" });
  assert.ok(chamadas[0].metodo === "sendMessage" && chamadas[0].args.message === "Já já alguém da loja te responde por aqui.");
  const fim = patches.at(-1)?.[1] as { status: string; node_id: string; error_code: string | null };
  assert.deepEqual([fim.status, fim.node_id, fim.error_code], ["done", "loja", null]);
  const c = indice.linhas.get("u1");
  assert.deepEqual([c?.status, c?.bot_paused_until], ["waiting", diaSeguinte]);
  const evento = indice.eventos.find((e) => e.kind === "waiting");
  assert.deepEqual([evento?.detail, evento?.runId, evento?.conversationId], ["handoff", "run-esp", c?.id]);
  assert.equal(JSON.stringify(indice.eventos).includes("Já já"), false, "o evento não leva texto de mensagem");
});

test("depois do handoff o robô fica calado: o próximo direct não abre nem retoma fluxo", async () => {
  const { amb, chamadas, indice } = ambiente({ fluxos: flux(comPergunta), esperando });
  await tratarEvento(outra, amb);
  const antes = chamadas.length;
  const outro = { ...direct, message: { ...direct.message, platformMessageId: "m-2", text: "quero" } };
  assert.deepEqual(await tratarEvento(outro, amb), { kind: "ignored", reason: "robô pausado" });
  assert.equal(chamadas.length, antes);
  assert.equal(indice.linhas.get("u1")?.status, "waiting");
});

test("handoff sem texto não manda nada e ainda passa pra loja", async () => {
  const def: FlowDef = { v: 1, nodes: [gatilho("dm"), { id: "loja", type: "handoff", text: null }], edges: [{ from: "gatilho", out: "next", to: "loja" }] };
  const { amb, chamadas, indice } = ambiente({ fluxos: flux(def) });
  assert.equal((await tratarEvento(direct, amb)).kind, "handled");
  assert.deepEqual(chamadas, []);
  assert.deepEqual([indice.linhas.get("u1")?.status, indice.linhas.get("u1")?.bot_paused_until], ["waiting", diaSeguinte]);
});

test("falha no índice não desfaz o envio nem derruba o atendimento", async () => {
  const { amb, chamadas, patches } = ambiente({ fluxos: flux(comPergunta), esperando, conversas: { falharAtualizar: true } });
  assert.equal((await tratarEvento(outra, amb)).kind, "handled");
  assert.equal(chamadas.length, 1);
  assert.equal((patches.at(-1)?.[1] as { status: string }).status, "done");
});

test("sem conversa no índice (entrada por comentário): o texto sai pela resposta privada e nada é gravado", async () => {
  const def: FlowDef = { v: 1, nodes: [gatilho("comment"), { id: "loja", type: "handoff", text: "Já já." }], edges: [{ from: "gatilho", out: "next", to: "loja" }] };
  const { amb, chamadas, indice } = ambiente({ fluxos: flux(def) });
  assert.equal((await tratarEvento(comentario, amb)).kind, "handled");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["privateReply"]);
  assert.deepEqual(indice.atualizacoes, []);
});

test("banco lento passando do teto da ficha: o ack sai, mas a pausa fica segura até terminar e é gravada", async () => {
  const { amb, indice, seguras } = ambiente({ fluxos: flux(comPergunta), esperando });
  const atualizar = amb.atualizarConversa;
  const lento: Ambiente = { ...amb, tetoDaFichaMs: 5, atualizarConversa: async (...a) => { await new Promise((ok) => setTimeout(ok, 60)); return atualizar(...a); } };
  assert.equal((await tratarEvento(outra, lento)).kind, "handled");
  assert.equal(indice.linhas.get("u1")?.status !== "waiting" || indice.linhas.get("u1")?.bot_paused_until !== diaSeguinte, true, "o ack saiu antes da pausa");
  assert.equal(seguras.length, 1);
  await Promise.all(seguras);
  assert.deepEqual([indice.linhas.get("u1")?.status, indice.linhas.get("u1")?.bot_paused_until], ["waiting", diaSeguinte]);
});
