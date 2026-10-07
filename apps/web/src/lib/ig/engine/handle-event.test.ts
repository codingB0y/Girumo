import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunRow } from "@/lib/stores/ig-runs";
import { tratarEvento, type Ambiente } from "./handle-event";

const T0 = new Date("2026-10-06T12:00:00Z");
const comentario: EventoZernio = { id: "e1", event: "comment.received", comment: { id: "c-1", platformPostId: "post-1", platform: "instagram", text: "quero", author: { id: "u1", username: "igortoled0", isOwnAccount: false }, createdAt: "2026-10-06T11:59:58Z", isReply: false }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };
const direct: EventoZernio = { id: "e2", event: "message.received", message: { platformMessageId: "m-1", platform: "instagram", direction: "incoming", text: "quero", sender: { id: "u1", username: "igortoled0" }, sentAt: "2026-10-06T11:59:58Z" }, conversation: { id: "conv-1", participantId: "u1" }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };

function ambiente(opts: { falhar?: NonNullable<Parameters<typeof createFakeTransport>[0]>["falhar"]; conta?: Partial<{ status: string; tenant_id: string }> | null; liberada?: boolean; fluxos?: Ambiente["fluxosNoAr"]; recente?: boolean; iniciados?: number; existente?: RunRow | null } = {}) {
  const { transport, chamadas } = createFakeTransport({ falhar: opts.falhar });
  const criados: unknown[] = [];
  const patches: Array<[string, unknown]> = [];
  const estados: Array<[string, string, string | null]> = [];
  let proximoId = 1;
  const def = { ...RECIPES.comment_invite.build() };
  const live = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  const dmDef = RECIPES.dm_invite.build();
  const dmLive = { ...dmDef, nodes: dmDef.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  const amb: Ambiente = {
    transport,
    now: () => T0,
    novoRef: () => "ref-fixo-12345",
    contaPorIdDaZernio: async (id) => (opts.conta === null || id !== "z1" ? null : { id: "a1", tenant_id: "loja-a", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t", ...opts.conta } as never),
    mudarEstadoDaConta: async (t, s, e) => { estados.push([t, s, e]); },
    lojaLiberada: async () => opts.liberada ?? true,
    fluxosNoAr: opts.fluxos ?? (async () => [{ id: "f-c", version: 3, published: live }, { id: "f-d", version: 1, published: dmLive }]),
    runs: {
      criar: async (tenantId, novo) => {
        criados.push({ tenantId, ...novo });
        if (opts.existente !== undefined) return null;
        return { id: `run-${proximoId++}`, tenant_id: tenantId, ig_account_id: novo.igAccountId, flow_id: novo.flowId, flow_version: novo.flowVersion, source_kind: novo.sourceKind, source_id: novo.sourceId, ig_user_id: novo.igUserId, username: novo.username, matched_keyword: novo.matchedKeyword, ref: novo.ref, status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: novo.windowExpiresAt, clicked_at: null, error_code: null, error_message: null, started_at: T0.toISOString(), updated_at: T0.toISOString(), finished_at: null };
      },
      porOrigem: async () => opts.existente ?? null,
      atualizar: async (_t, id, patch) => { patches.push([id, patch]); },
      passo: async () => {},
      iniciadosDesde: async () => opts.iniciados ?? 0,
      entradaRecente: async () => opts.recente ?? false,
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, criados, patches, estados };
}

test("comentário com a palavra vira run, resposta pública + privada com o link, e termina", async () => {
  const { amb, chamadas, criados, patches } = ambiente();
  const d = await tratarEvento(comentario, amb);
  assert.deepEqual(d, { kind: "handled", tenantId: "loja-a", runId: "run-1", status: "done" });
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
  const novo = criados[0] as Record<string, unknown>;
  assert.equal(novo.flowId, "f-c");
  assert.equal(novo.sourceId, "c-1");
  assert.equal(novo.matchedKeyword, "quero");
  assert.equal(novo.windowExpiresAt, "2026-10-13T11:59:58.000Z");
  assert.deepEqual(patches[0][1], { status: "done", node_id: "convite", waiting: null, error_code: null, error_message: null, finished_at: T0.toISOString() });
});

test("direct e story pegam o fluxo de direct; a janela é de 24 h", async () => {
  const { amb, chamadas, criados } = ambiente();
  await tratarEvento(direct, amb);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  assert.equal((criados[0] as { sourceKind: string }).sourceKind, "dm");
  assert.equal((criados[0] as { windowExpiresAt: string }).windowExpiresAt, "2026-10-07T11:59:58.000Z");
  // Story só dispara com a palavra (decisão de 06/10).
  const storyAmb = ambiente();
  const story: EventoZernio = { ...direct, id: "e3", message: { ...direct.message, platformMessageId: "m-2", text: "lindo" }, metadata: { storyReply: { storyId: "s1" } } };
  assert.equal((await tratarEvento(story, storyAmb.amb)).kind, "ignored");
  await tratarEvento({ ...story, message: { ...story.message, platformMessageId: "m-3", text: "quero" } }, storyAmb.amb);
  assert.equal((storyAmb.criados[0] as { sourceKind: string }).sourceKind, "story");
  assert.equal((storyAmb.criados[0] as { matchedKeyword: string | null }).matchedKeyword, "quero");
});

test("ignora: conta desconhecida, conta inativa, loja sem liberação, comentário da própria conta, resposta a comentário, sem palavra, direct de saída", async () => {
  assert.equal((await tratarEvento(comentario, ambiente({ conta: null }).amb)).kind, "ignored");
  assert.equal((await tratarEvento(comentario, ambiente({ conta: { status: "expired" } }).amb)).kind, "ignored");
  assert.equal((await tratarEvento(comentario, ambiente({ liberada: false }).amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, author: { ...comentario.comment.author, isOwnAccount: true } } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, isReply: true } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, text: "lindo" } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...direct, message: { ...direct.message, direction: "outgoing" } }, ambiente().amb)).kind, "ignored");
});

test("proteções: entrada recente da pessoa e teto da conta não criam run", async () => {
  const a = ambiente({ recente: true });
  assert.deepEqual(await tratarEvento(comentario, a.amb), { kind: "ignored", reason: "24h" });
  assert.equal(a.criados.length, 0);
  const b = ambiente({ iniciados: 700 });
  assert.deepEqual(await tratarEvento(comentario, b.amb), { kind: "ignored", reason: "teto" });
});

test("reenvio: na fila há pouco pede nova tentativa; há mais de 2 min é retomado (mesmo com a trava de 24 h); terminado é duplicado", async () => {
  const base: RunRow = { id: "run-velho", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-c", flow_version: 3, source_kind: "comment", source_id: "c-1", ig_user_id: "u1", username: null, matched_keyword: "quero", ref: "r", status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: "2026-10-13T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T11:59:30Z", updated_at: "2026-10-06T11:59:30Z", finished_at: null };
  assert.deepEqual(await tratarEvento(comentario, ambiente({ existente: base }).amb), { kind: "retry", reason: "em andamento" });
  // O próprio run da 1ª tentativa casa a trava de 24 h: o reenvio precisa passar antes dela.
  const antigo = ambiente({ existente: { ...base, started_at: "2026-10-06T11:57:00Z" }, recente: true });
  assert.deepEqual(await tratarEvento(comentario, antigo.amb), { kind: "handled", tenantId: "loja-a", runId: "run-velho", status: "done" });
  assert.equal((await tratarEvento(comentario, ambiente({ existente: { ...base, status: "done", started_at: "2026-10-06T11:00:00Z" } }).amb)).kind, "ignored");
  const trocado = ambiente({ existente: { ...base, flow_id: "f-outro", started_at: "2026-10-06T11:57:00Z" } });
  assert.deepEqual(await tratarEvento(comentario, trocado.amb), { kind: "ignored", reason: "fluxo mudou" });
  assert.equal((trocado.patches[0][1] as { status: string }).status, "stopped");
  assert.equal(trocado.chamadas.length, 0);
});

test("erro passageiro da Zernio pede reenvio e não grava falha; eventos de conta mudam o estado", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const a = ambiente({ falhar: { privateReply: fora } });
  assert.deepEqual(await tratarEvento(comentario, a.amb), { kind: "retry", reason: "temporarily_unavailable" });
  assert.equal(a.patches.length, 0);

  const b = ambiente();
  await tratarEvento({ id: "e9", event: "account.disconnected", account: { accountId: "z1", reason: "token expirou" }, timestamp: "t" }, b.amb);
  await tratarEvento({ id: "e10", event: "account.connected", account: { accountId: "z1" }, timestamp: "t" }, b.amb);
  assert.deepEqual(b.estados, [["loja-a", "expired", "token expirou"], ["loja-a", "active", null]]);
});

test("data da Zernio que não parseia conta a janela a partir de agora", async () => {
  const { amb, criados } = ambiente();
  const d = await tratarEvento({ ...comentario, id: "e11", comment: { ...comentario.comment, id: "c-9", createdAt: "ontem" } }, amb);
  assert.equal(d.kind, "handled");
  assert.equal((criados[0] as { windowExpiresAt: string }).windowExpiresAt, "2026-10-13T12:00:00.000Z");
});
