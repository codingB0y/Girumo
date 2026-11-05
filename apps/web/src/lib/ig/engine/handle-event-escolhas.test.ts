import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowDef } from "@/lib/ig/flow/types";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunRow } from "@/lib/stores/ig-runs";
import { ambiente, comentario, direct, T0 } from "./ambiente-falso";
import { tratarEvento, type Ambiente } from "./handle-event";

const comOutro: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "q", type: "message", text: "Quer o link do grupo?", button: null, wait: { minutes: 1380 }, choices: ["Sim, quero", "Não"], saveTo: "interesse" },
    { id: "convite", type: "invite", text: "Clique no botão abaixo.", campaignSlug: "vip", button: "Entrar no grupo VIP", remindAfterMinutes: null },
    { id: "t", type: "tag", add: ["nao-quer"], remove: [] },
    { id: "ajuda", type: "message", text: "Posso ajudar com algo?", button: null, wait: null },
  ],
  edges: [
    { from: "gatilho", out: "next", to: "q" },
    { from: "q", out: "v0", to: "convite" },
    { from: "q", out: "v1", to: "t" },
    { from: "q", out: "other", to: "ajuda" },
  ],
};
const semOutro: FlowDef = { ...comOutro, edges: comOutro.edges.filter((e) => e.out !== "other") };
const flux = (def: FlowDef): Ambiente["fluxosNoAr"] => async () => [{ id: "f-esc", version: 1, published: def }];
const esperando: RunRow = { id: "run-esp", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-esc", flow_version: 1, source_kind: "comment", source_id: "c-1", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "ref-esp", status: "active", node_id: "q", waiting: "reply", wake_at: "2026-10-07T11:00:00Z", window_expires_at: "2026-10-13T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T11:00:00Z", updated_at: "2026-10-06T11:00:01Z", finished_at: null };
const resposta = (text: string | null, payload?: string): EventoZernio => {
  const base = direct as Extract<EventoZernio, { event: "message.received" }>;
  return { ...base, message: { ...base.message, platformMessageId: `m-${text ?? "toque"}`, text }, ...(payload ? { metadata: { postbackPayload: payload } } : {}) };
};

test("toque na resposta rápida: v0, guarda a escolha inteira na ficha, convite sai com o botão", async () => {
  const { amb, chamadas, fichas, patches } = ambiente({ fluxos: flux(comOutro), esperando });
  const d = await tratarEvento(resposta("Sim, quero", "run-esp:q:0"), amb);
  assert.deepEqual(d, { kind: "handled", tenantId: "loja-a", runId: "run-esp", status: "done" });
  assert.equal(fichas.linhas.get("loja-a:u1")?.fields.interesse, "Sim, quero");
  assert.ok(chamadas[0].metodo === "sendMessage" && chamadas[0].args.buttons?.[0].title === "Entrar no grupo VIP");
  assert.equal((patches[0][1] as { node_id: string }).node_id, "convite");
});

test("toque sem texto vale pelo payload; payload de outro run cai no texto", async () => {
  const semTexto = ambiente({ fluxos: flux(comOutro), esperando });
  assert.equal((await tratarEvento(resposta(null, "run-esp:q:1"), semTexto.amb)).kind, "handled");
  assert.deepEqual(semTexto.fichas.linhas.get("loja-a:u1")?.tags, ["nao-quer"], "v1 → Etiqueta");
  assert.equal(semTexto.fichas.linhas.get("loja-a:u1")?.fields.interesse, "Não");
  assert.equal(semTexto.chamadas.length, 0, "Etiqueta não manda mensagem");

  const velho = ambiente({ fluxos: flux(comOutro), esperando });
  await tratarEvento(resposta("Não", "run-velho:q:0"), velho.amb);
  assert.equal(velho.fichas.linhas.get("loja-a:u1")?.fields.interesse, "Não", "o texto decide: v1");
});

test("digitando: a escolha casa por texto, e qualquer alternativa separada por vírgula vale", async () => {
  for (const texto of ["sim", "QUERO!", "Sim, quero"]) {
    const { amb, fichas } = ambiente({ fluxos: flux(comOutro), esperando });
    assert.equal((await tratarEvento(resposta(texto), amb)).kind, "handled", texto);
    assert.equal(fichas.linhas.get("loja-a:u1")?.fields.interesse, "Sim, quero", texto);
  }
});

test("outro ligado: segue por other e guarda o texto livre cortado em 200", async () => {
  const longo = "o que é isso? ".repeat(30);
  const { amb, chamadas, fichas } = ambiente({ fluxos: flux(comOutro), esperando });
  assert.equal((await tratarEvento(resposta(longo), amb)).kind, "handled");
  assert.equal(fichas.linhas.get("loja-a:u1")?.fields.interesse, longo.trim().slice(0, 200));
  assert.ok(chamadas[0].metodo === "sendMessage" && chamadas[0].args.message === "Posso ajudar com algo?");
});

test("outro sem ligação: não reivindica, o run segue esperando e o direct cai no caminho normal", async () => {
  const { amb, chamadas, patches, reivindicacoes, fichas } = ambiente({ fluxos: flux(semOutro), esperando });
  assert.deepEqual(await tratarEvento(resposta("o que é isso?"), amb), { kind: "ignored", reason: "sem fluxo" });
  assert.deepEqual([chamadas.length, patches.length, reivindicacoes.length], [0, 0, 0]);
  assert.equal(fichas.linhas.get("loja-a:u1")?.fields.interesse, undefined);
});

test("todo direct recebido grava a ficha, mesmo sem fluxo: dm, hora de chegada e @", async () => {
  const { amb, fichas } = ambiente({ fluxos: async () => [] });
  assert.deepEqual(await tratarEvento(direct, amb), { kind: "ignored", reason: "sem fluxo" });
  assert.equal(fichas.aplicacoes.length, 1);
  assert.deepEqual(fichas.aplicacoes[0], { igUserId: "u1", username: "igortoled0", seenAt: T0.toISOString(), dm: true });
});

test("erro ao gravar a ficha não derruba o atendimento", async () => {
  const erro = console.error;
  console.error = () => {};
  try {
    const { amb, chamadas } = ambiente({ contatos: { falharAplicar: true } });
    assert.equal((await tratarEvento(direct, amb)).kind, "handled");
    assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  } finally {
    console.error = erro;
  }
});

test("comentário que entra num fluxo grava a ficha sem abrir a janela; o que não casa não cria pessoa", async () => {
  const entra = ambiente();
  await tratarEvento(comentario, entra.amb);
  assert.deepEqual(entra.fichas.aplicacoes[0], { igUserId: "u1", username: "igortoled0", seenAt: T0.toISOString(), dm: false, sourceFlowId: "f-c" });
  assert.equal(entra.fichas.linhas.get("loja-a:u1")?.last_dm_at, null);

  const naoCasa = ambiente();
  await tratarEvento({ ...comentario, comment: { ...(comentario as Extract<EventoZernio, { event: "comment.received" }>).comment, text: "lindo" } }, naoCasa.amb);
  assert.equal(naoCasa.fichas.aplicacoes.length, 0);
});
