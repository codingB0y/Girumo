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

test("toque sem texto vale pelo payload", async () => {
  const semTexto = ambiente({ fluxos: flux(comOutro), esperando });
  assert.equal((await tratarEvento(resposta(null, "run-esp:q:1"), semTexto.amb)).kind, "handled");
  assert.deepEqual(semTexto.fichas.linhas.get("loja-a:u1")?.tags, ["nao-quer"], "v1 → Etiqueta");
  assert.equal(semTexto.fichas.linhas.get("loja-a:u1")?.fields.interesse, "Não");
  assert.equal(semTexto.chamadas.length, 0, "Etiqueta não manda mensagem");

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
  assert.deepEqual(fichas.aplicacoes[0], { igUserId: "u1", username: "igortoled0", seenAt: "2026-10-06T11:59:58.000Z", dm: true });
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

test("toque de run ou bloco velho: ignora, não reivindica nem consome a espera, mesmo com other ligado e texto que casa", async () => {
  for (const payload of ["run-velho:q:1", "run-esp:outro:1"]) {
    const { amb, chamadas, patches, reivindicacoes, fichas } = ambiente({ fluxos: flux(comOutro), esperando });
    assert.equal((await tratarEvento(resposta("Não", payload), amb)).kind, "ignored", payload);
    assert.deepEqual([chamadas.length, patches.length, reivindicacoes.length], [0, 0, 0], payload);
    assert.equal(fichas.linhas.get("loja-a:u1")?.fields.interesse, undefined);
  }
});

test("texto ambíguo entre escolhas ('não quero') não vira Sim: cai em other", async () => {
  const { amb, fichas, chamadas } = ambiente({ fluxos: flux(comOutro), esperando });
  assert.equal((await tratarEvento(resposta("não quero"), amb)).kind, "handled");
  assert.equal(fichas.linhas.get("loja-a:u1")?.fields.interesse, "não quero");
  assert.equal(chamadas[0].metodo === "sendMessage" && chamadas[0].args.message, "Posso ajudar com algo?");
});

test("a ficha grava em paralelo com o motor: o envio sai sem esperar o banco da ficha, e o ack só vem depois dela", async () => {
  let soltar: () => void = () => {};
  const segurar = new Promise<void>((ok) => { soltar = ok; });
  const { amb, chamadas } = ambiente({ contatos: { segurar } });
  let respondeu = false;
  const p = tratarEvento(direct, amb).then((d) => { respondeu = true; return d; });
  for (let i = 0; i < 50 && chamadas.length === 0; i++) await new Promise((ok) => setImmediate(ok));
  assert.equal(chamadas.length, 1, "o motor não esperou a gravação da ficha");
  assert.equal(respondeu, false, "mas o ack espera ela terminar");
  soltar();
  assert.equal((await p).kind, "handled");
});

test("comentário barrado pelas travas (24 h ou teto) não cria pessoa", async () => {
  for (const opts of [{ recente: true }, { iniciados: 700 }]) {
    const { amb, fichas } = ambiente(opts);
    assert.equal((await tratarEvento(comentario, amb)).kind, "ignored");
    assert.equal(fichas.aplicacoes.length, 0);
  }
});

test("o log de falha da ficha traz só o tipo do erro, nunca a mensagem do banco", async () => {
  const erro = console.error;
  const logs: string[] = [];
  console.error = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    const { amb } = ambiente({ contatos: { falharAplicar: "duplicate key Key (tenant_id, ig_user_id)=(loja-a, u1)" } });
    await tratarEvento(direct, amb);
  } finally {
    console.error = erro;
  }
  assert.equal(logs.length, 1);
  assert.ok(!/loja-a|u1|Key \(/.test(logs[0]), logs[0]);
});

const comSe: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "t", type: "tag", add: ["vip"], remove: [] },
    { id: "c", type: "condition", check: "tag", tag: "vip" },
    { id: "a", type: "message", text: "Mensagem A", button: null, wait: null },
    { id: "b", type: "message", text: "Mensagem B", button: null, wait: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "t" }, { from: "t", out: "next", to: "c" }, { from: "c", out: "yes", to: "a" }, { from: "c", out: "no", to: "b" }],
};

test("reenvio de run na fila: o Se… reusa a saída que a 1ª tentativa gravou e a pessoa recebe a mesma mensagem", async () => {
  const velho: RunRow = { ...esperando, status: "queued", flow_id: "f-esc", node_id: null, waiting: null, wake_at: null, started_at: "2026-10-06T11:57:00Z", updated_at: "2026-10-06T11:57:00Z" };
  // A 1ª tentativa decidiu "no" (antes de a etiqueta existir); a ficha agora já tem a etiqueta.
  const { amb, chamadas } = ambiente({ fluxos: flux(comSe), existente: velho, recente: true, passos: [{ node_id: "gatilho", out: "next" }, { node_id: "t", out: "next" }, { node_id: "c", out: "no" }], contatos: { inicial: { ig_user_id: "u1", tags: ["vip"] } } });
  assert.equal((await tratarEvento(comentario, amb)).kind, "handled");
  assert.ok(chamadas[chamadas.length - 1].metodo === "privateReply" && (chamadas[chamadas.length - 1] as { args: { message: string } }).args.message === "Mensagem B");
});


const ciclo: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "q", type: "message", text: "Qual a cidade?", button: null, wait: { minutes: 1380 }, choices: ["Goiânia", "Rio"], saveTo: "cidade" },
    { id: "c", type: "condition", check: "field", field: "cidade", values: ["goiania", "rio"] },
    { id: "nao", type: "message", text: "Não entendi", button: null, wait: null },
    { id: "i0", type: "message", text: "Goiânia!", button: null, wait: null },
    { id: "i1", type: "message", text: "Rio!", button: null, wait: null },
  ],
  edges: [
    { from: "gatilho", out: "next", to: "q" },
    { from: "q", out: "v0", to: "c" }, { from: "q", out: "v1", to: "c" }, { from: "q", out: "other", to: "c" },
    { from: "c", out: "v0", to: "i0" }, { from: "c", out: "v1", to: "i1" }, { from: "c", out: "other", to: "nao" },
    { from: "nao", out: "next", to: "q" },
  ],
};
const passagemVelha = [{ node_id: "gatilho", out: "next" }, { node_id: "q", out: "other" }, { node_id: "c", out: "other" }, { node_id: "nao", out: "next" }];

test("ciclo Pergunta → Se… → 'não entendi' → Pergunta: a 2ª resposta válida (1ª tentativa) segue pelo ramo do valor, sem reusar a passagem velha", async () => {
  const { amb, chamadas } = ambiente({ fluxos: flux(ciclo), esperando, passos: passagemVelha });
  assert.equal((await tratarEvento(resposta("Rio"), amb)).kind, "handled");
  assert.equal(chamadas[0].metodo === "sendMessage" && chamadas[0].args.message, "Rio!");
});

test("reenvio da retomada: o Se… repete a saída que a tentativa anterior gravou depois do bloco que esperava", async () => {
  const passos = [...passagemVelha, { node_id: "q", out: "v1" }, { node_id: "c", out: "v0" }];
  const { amb, chamadas } = ambiente({ fluxos: flux(ciclo), retomado: esperando, passos });
  assert.equal((await tratarEvento(resposta("Rio"), amb)).kind, "handled");
  assert.equal(chamadas[0].metodo === "sendMessage" && chamadas[0].args.message, "Goiânia!");
});

test("a ficha travada não trava o ack: passado o teto, registra e responde", async () => {
  const erro = console.error;
  console.error = () => {};
  try {
    const { amb, chamadas } = ambiente({ contatos: { segurar: new Promise<void>(() => {}) } });
    amb.tetoDaFichaMs = 20;
    assert.equal((await tratarEvento(direct, amb)).kind, "handled");
    assert.equal(chamadas.length, 1);
  } finally {
    console.error = erro;
  }
});
