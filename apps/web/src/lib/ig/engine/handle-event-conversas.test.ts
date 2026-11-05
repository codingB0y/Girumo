import assert from "node:assert/strict";
import { test } from "node:test";
import { ZernioError } from "@/lib/ig/transport/types";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunRow } from "@/lib/stores/ig-runs";
import { ambiente, comentario, direct, T0 } from "./ambiente-falso";
import { tratarEvento } from "./handle-event";

// O índice das Conversas (spec §7.3/§7.4) e a pausa do robô (§6).

const semFluxo: EventoZernio = { ...direct, id: "e9", message: { ...direct.message, platformMessageId: "m-9", text: "bom dia" } };
const enviada: EventoZernio = { id: "e5", event: "message.sent", message: { platformMessageId: "m-out-1", platform: "instagram", text: "Oi, pode falar", sentAt: "2026-10-06T12:00:05Z" }, conversation: { id: "conv-1", participantId: "u1", participantUsername: "igortoled0" }, account: { accountId: "z1" }, timestamp: "2026-10-06T12:00:06Z" };
const pausada = { ig_user_id: "u1", bot_paused_until: "2026-10-06T18:00:00Z", status: "open" as const };

test("direct que casa fluxo: conversa Aberta, não lida +1 e um evento bot_message por envio, com o id da mensagem e sem texto", async () => {
  const a = ambiente();
  const d = await tratarEvento(direct, a.amb);
  assert.equal(d.kind, "handled");
  assert.equal(a.indice.toques.length, 1);
  assert.deepEqual(
    [a.indice.toques[0].status, a.indice.toques[0].direction, a.indice.toques[0].zernioConversationId, a.indice.toques[0].preview],
    ["open", "in", "conv-1", "quero"],
  );
  assert.equal(a.indice.linhas.get("u1")?.unread_count, 1);
  assert.equal(a.indice.eventos.length, 1);
  assert.deepEqual([a.indice.eventos[0].kind, a.indice.eventos[0].zernioMessageId, a.indice.eventos[0].runId, a.indice.eventos[0].detail], ["bot_message", "msg-falsa-1", "run-1", "invite"]);
  assert.equal(JSON.stringify(a.indice.eventos).includes("Oi"), false, "o evento não leva texto de mensagem");
});

test("direct sem fluxo: Aguardando você, não lida +1, nenhum evento do robô", async () => {
  const a = ambiente();
  assert.deepEqual(await tratarEvento(semFluxo, a.amb), { kind: "ignored", reason: "sem fluxo" });
  assert.equal(a.indice.toques[0].status, "waiting");
  assert.equal(a.indice.linhas.get("u1")?.unread_count, 1);
  assert.deepEqual(a.indice.eventos, []);
  assert.deepEqual(a.chamadas, []);
});

test("direct sem texto (só mídia) também entra no índice, com prévia vazia", async () => {
  const a = ambiente();
  const midia: EventoZernio = { ...semFluxo, message: { ...semFluxo.message, text: null } };
  assert.deepEqual(await tratarEvento(midia, a.amb), { kind: "ignored", reason: "evento sem gatilho" });
  assert.deepEqual([a.indice.toques[0].status, a.indice.toques[0].preview], ["waiting", null]);
});

test("message.sent atualiza prévia e direção sem somar não lida nem pausar o robô", async () => {
  const a = ambiente({ conversas: { inicial: { ig_user_id: "u1", unread_count: 2, last_direction: "in", last_preview: "oi", last_message_at: "2026-10-06T11:59:58Z", status: "waiting" } } });
  assert.deepEqual(await tratarEvento(enviada, a.amb), { kind: "ignored", reason: "enviada" });
  const c = a.indice.linhas.get("u1");
  assert.deepEqual([c?.last_direction, c?.last_preview, c?.unread_count, c?.status, c?.bot_paused_until], ["out", "Oi, pode falar", 2, "waiting", null]);
  assert.equal(a.indice.toques[0].status, null);
  assert.deepEqual(a.indice.eventos, []);
  assert.deepEqual(a.chamadas, []);
});

test("message.sent atrasado não desfaz a lista, e de conversa desconhecida não cria linha", async () => {
  const atrasado = ambiente({ conversas: { inicial: { ig_user_id: "u1", last_direction: "in", last_preview: "mais nova", last_message_at: "2026-10-06T12:30:00Z" } } });
  await tratarEvento(enviada, atrasado.amb);
  assert.deepEqual([atrasado.indice.linhas.get("u1")?.last_direction, atrasado.indice.linhas.get("u1")?.last_preview], ["in", "mais nova"]);
  const desconhecida = ambiente();
  await tratarEvento(enviada, desconhecida.amb);
  assert.deepEqual([desconhecida.indice.toques, desconhecida.indice.linhas.size], [[], 0]);
});

test("message.sent de conta inativa ou loja sem liberação não toca o índice", async () => {
  const a = ambiente({ conta: { status: "expired" }, conversas: { inicial: { ig_user_id: "u1" } } });
  await tratarEvento(enviada, a.amb);
  assert.deepEqual(a.indice.toques, []);
});

test("robô pausado: o direct não abre run, vai para o índice como Aguardando você e a ficha segue gravada", async () => {
  const a = ambiente({ conversas: { inicial: pausada } });
  assert.deepEqual(await tratarEvento(direct, a.amb), { kind: "ignored", reason: "robô pausado" });
  assert.deepEqual([a.criados.length, a.chamadas.length], [0, 0]);
  assert.deepEqual([a.indice.toques[0].status, a.indice.linhas.get("u1")?.unread_count], ["waiting", 1]);
  assert.equal(a.fichas.aplicacoes.length, 1);
  assert.equal(a.fichas.aplicacoes[0].dm, true);
});

test("robô pausado: a resposta de quem tem run esperando não retoma o run", async () => {
  const esperando = { id: "run-w", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-d", flow_version: 1, source_kind: "comment", source_id: "c-0", ig_user_id: "u1", username: null, matched_keyword: "quero", ref: "r", status: "active", node_id: "x", waiting: "reply", wake_at: "2026-10-06T13:00:00Z", window_expires_at: "2026-10-13T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T11:00:00Z", updated_at: "2026-10-06T11:00:00Z", finished_at: null } as RunRow;
  const a = ambiente({ esperando, conversas: { inicial: pausada } });
  assert.deepEqual(await tratarEvento(direct, a.amb), { kind: "ignored", reason: "robô pausado" });
  assert.deepEqual([a.buscas.length, a.reivindicacoes.length, a.chamadas.length], [0, 0, 0]);
});

test("robô pausado: comentário que casaria um fluxo também não abre run, e não toca o índice", async () => {
  const a = ambiente({ conversas: { inicial: pausada } });
  assert.deepEqual(await tratarEvento(comentario, a.amb), { kind: "ignored", reason: "robô pausado" });
  assert.deepEqual([a.criados.length, a.chamadas.length, a.indice.toques.length], [0, 0, 0]);
});

test("pausa vencida não segura o robô", async () => {
  const a = ambiente({ conversas: { inicial: { ...pausada, bot_paused_until: "2026-10-06T11:00:00Z" } } });
  assert.equal((await tratarEvento(direct, a.amb)).kind, "handled");
  assert.equal(a.indice.toques[0].status, "open");
});

test("comentário com conversa já conhecida: evento bot_message da resposta privada, sem tocar o índice; sem conversa conhecida não grava", async () => {
  const a = ambiente({ conversas: { inicial: { ig_user_id: "u1" } } });
  assert.equal((await tratarEvento(comentario, a.amb)).kind, "handled");
  assert.equal(a.indice.toques.length, 0);
  assert.deepEqual(a.indice.eventos.map((e) => [e.conversationId, e.zernioMessageId, e.runId]), [["conv-u1", "msg-falsa-1", "run-1"]]);
  const sem = ambiente();
  assert.equal((await tratarEvento(comentario, sem.amb)).kind, "handled");
  assert.deepEqual([sem.indice.toques, sem.indice.eventos], [[], []]);
});

test("falha ao gravar o índice não derruba a resposta do robô nem pede reenvio", async () => {
  const a = ambiente({ conversas: { falharTocar: true } });
  const erro = console.error;
  console.error = () => {};
  try {
    assert.equal((await tratarEvento(direct, a.amb)).kind, "handled");
  } finally {
    console.error = erro;
  }
  assert.deepEqual(a.chamadas.map((c) => c.metodo), ["sendMessage"]);
});

test("falha ao gravar o evento do robô também só é registrada", async () => {
  const a = ambiente({ conversas: { falharEvento: true } });
  const erro = console.error;
  console.error = () => {};
  try {
    assert.equal((await tratarEvento(direct, a.amb)).kind, "handled");
  } finally {
    console.error = erro;
  }
  assert.equal(a.indice.toques.length, 1);
});

test("erro passageiro antes do desfecho pede reenvio e o direct já entra no índice como Aguardando você", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const a = ambiente({ falhar: { sendMessage: fora } });
  assert.equal((await tratarEvento(direct, a.amb)).kind, "retry");
  assert.deepEqual([a.indice.toques.length, a.indice.toques[0].status, a.indice.linhas.get("u1")?.unread_count], [1, "waiting", 1]);
});

test("exceção do motor: o direct entra no índice como Aguardando você e o erro sobe para o 500", async () => {
  const a = ambiente();
  a.amb.fluxosNoAr = async () => { throw new Error("banco fora"); };
  await assert.rejects(() => tratarEvento(direct, a.amb), /banco fora/);
  assert.deepEqual([a.indice.toques[0].status, a.indice.linhas.get("u1")?.unread_count], ["waiting", 1]);
});

test("reentrega do mesmo direct: não soma não lida de novo e não rebaixa uma Aberta", async () => {
  const a = ambiente();
  await tratarEvento(direct, a.amb);
  const feito = a.patches.length;
  assert.equal(feito, 1);
  // Entrega repetida (o sem-fluxo, o 24h e o pausado também voltam a passar por aqui): mesmo id, nada muda.
  await tratarEvento(direct, a.amb);
  await tratarEvento(semFluxo, ambiente({ conversas: { inicial: { ig_user_id: "u1" } } }).amb);
  assert.deepEqual([a.indice.linhas.get("u1")?.unread_count, a.indice.linhas.get("u1")?.status], [1, "open"]);
  assert.equal(a.indice.toques.every((t) => t.messageId === "m-1"), true);
});

test("run já terminado (duplicado): toca o índice sem mudar a situação, sem mandar de novo", async () => {
  const feito = { id: "run-velho", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-d", flow_version: 1, source_kind: "dm", source_id: "m-1", ig_user_id: "u1", username: null, matched_keyword: "quero", ref: "r", status: "done", node_id: "convite", waiting: null, wake_at: null, window_expires_at: "2026-10-07T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: T0.toISOString(), updated_at: T0.toISOString(), finished_at: T0.toISOString() } as RunRow;
  const a = ambiente({ existente: feito, conversas: { inicial: { ig_user_id: "u1", status: "open" } } });
  assert.deepEqual(await tratarEvento(direct, a.amb), { kind: "ignored", reason: "duplicado" });
  assert.deepEqual([a.chamadas.length, a.indice.toques.length, a.indice.toques[0].status, a.indice.linhas.get("u1")?.status], [0, 1, null, "open"]);
});

test("ler a conversa lançando no direct pede reenvio sem responder; no comentário o robô segue", async () => {
  const a = ambiente();
  a.amb.conversas = { ...a.amb.conversas, ler: async () => { throw new Error("rede"); } };
  const erro = console.error;
  const logs: unknown[][] = [];
  console.error = (...x: unknown[]) => { logs.push(x); };
  try {
    assert.deepEqual(await tratarEvento(direct, a.amb), { kind: "retry", reason: "conversa" });
    assert.equal(a.chamadas.length, 0);
    assert.equal((await tratarEvento(comentario, a.amb)).kind, "handled");
  } finally {
    console.error = erro;
  }
  assert.equal(logs.some((l) => String(l[0]).includes("ler falhou")), true, "o log diz a operação");
  assert.equal(JSON.stringify(logs).includes("rede"), false, "e não a mensagem do erro");
});
