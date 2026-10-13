import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import type { FlowDef } from "@/lib/ig/flow/types";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunRow } from "@/lib/stores/ig-runs";
import { tratarEvento, type Ambiente } from "./handle-event";

const T0 = new Date("2026-10-06T12:00:00Z");
const comentario: EventoZernio = { id: "e1", event: "comment.received", comment: { id: "c-1", platformPostId: "post-1", platform: "instagram", text: "quero", author: { id: "u1", username: "igortoled0", isOwnAccount: false }, createdAt: "2026-10-06T11:59:58Z", isReply: false }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };
const direct: EventoZernio = { id: "e2", event: "message.received", message: { platformMessageId: "m-1", platform: "instagram", direction: "incoming", text: "quero", sender: { id: "u1", username: "igortoled0" }, sentAt: "2026-10-06T11:59:58Z" }, conversation: { id: "conv-1", participantId: "u1" }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };

function ambiente(opts: { falhar?: NonNullable<Parameters<typeof createFakeTransport>[0]>["falhar"]; conta?: Partial<{ status: string; tenant_id: string }> | null; liberada?: boolean; fluxos?: Ambiente["fluxosNoAr"]; recente?: boolean; iniciados?: number; existente?: RunRow | null; esperando?: RunRow | null; reivindicado?: boolean; retomado?: RunRow | null; parado?: boolean } = {}) {
  const { transport, chamadas } = createFakeTransport({ falhar: opts.falhar });
  const criados: unknown[] = [];
  const patches: Array<[string, unknown]> = [];
  const buscas: Array<[string, string | null, string]> = [];
  const reivindicacoes: string[] = [];
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
      esperando: async (_t, _conta, igUserId, username, agoraIso) => { buscas.push([igUserId, username, agoraIso]); return opts.esperando ?? null; },
      reivindicar: async (_t, _id, _no, messageId) => { reivindicacoes.push(messageId); return opts.reivindicado ?? true; },
      retomadoPor: async () => opts.retomado ?? null,
      retomarParado: async () => opts.parado ?? true,
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, criados, patches, estados, buscas, reivindicacoes };
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
  assert.deepEqual(patches[0][1], { status: "done", node_id: "convite", waiting: null, wake_at: null, error_code: null, error_message: null, finished_at: T0.toISOString() });
});

test("finished_at é a hora do fim do passo, não a da chegada do evento", async () => {
  const { amb, patches } = ambiente();
  let leituras = 0;
  amb.now = () => new Date(T0.getTime() + 1000 * leituras++);
  await tratarEvento(comentario, amb);
  const fim = (patches[0][1] as { finished_at: string }).finished_at;
  assert.ok(Date.parse(fim) > T0.getTime(), `finished_at ${fim} não pode ser a hora da chegada`);
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

/** Comentário → pergunta que espera "sim" → convite com botão, já no ar. */
const confirmaDef: FlowDef = {
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
    { id: "pergunta", type: "message", text: "Quer o link? Responde SIM.", button: null, wait: { minutes: 1380, keywords: ["sim"] } },
    { id: "convite", type: "invite", text: "Clique no botão abaixo.", campaignSlug: "vip", button: "Entrar no grupo VIP", remindAfterMinutes: null },
  ],
  edges: [{ from: "gatilho", out: "next", to: "pergunta" }, { from: "pergunta", out: "replied", to: "convite" }],
};
const soConfirma: Ambiente["fluxosNoAr"] = async () => [{ id: "f-conf", version: 1, published: confirmaDef }];
const esperandoRun: RunRow = { id: "run-esp", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-conf", flow_version: 1, source_kind: "comment", source_id: "c-1", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "ref-esp", status: "active", node_id: "pergunta", waiting: "reply", wake_at: "2026-10-07T11:00:00Z", window_expires_at: "2026-10-13T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T11:00:00Z", updated_at: "2026-10-06T11:00:01Z", finished_at: null };
const resposta = (text: string, extra: Partial<EventoZernio> = {}): EventoZernio => ({ ...direct, message: { ...(direct as Extract<EventoZernio, { event: "message.received" }>).message, platformMessageId: `m-${text}`, text }, ...extra }) as EventoZernio;

test("o comentário vira a pergunta e o run fica esperando a resposta até a hora marcada", async () => {
  const { amb, chamadas, patches } = ambiente({ fluxos: soConfirma });
  const d = await tratarEvento(comentario, amb);
  assert.deepEqual(d, { kind: "handled", tenantId: "loja-a", runId: "run-1", status: "active" });
  assert.deepEqual(chamadas.map((c) => c.metodo), ["privateReply"]);
  assert.deepEqual(patches[0][1], { status: "active", node_id: "pergunta", waiting: "reply", wake_at: "2026-10-07T11:00:00.000Z", error_code: null, error_message: null, finished_at: null });
});

test("o 'sim' no direct retoma o run: convite com botão na conversa, run termina, nenhum run novo", async () => {
  const { amb, chamadas, patches, criados, buscas } = ambiente({ fluxos: soConfirma, esperando: esperandoRun });
  const d = await tratarEvento(resposta("Sim, quero!"), amb);
  assert.deepEqual(d, { kind: "handled", tenantId: "loja-a", runId: "run-esp", status: "done" });
  assert.deepEqual(buscas, [["u1", "igortoled0", T0.toISOString()]], "a busca só vê espera que não venceu");
  assert.equal(criados.length, 0);
  assert.ok(chamadas[0].metodo === "sendMessage");
  assert.deepEqual(chamadas[0].args, { accountId: "z1", conversationId: "conv-1", message: "Clique no botão abaixo.", buttons: [{ type: "url", title: "Entrar no grupo VIP", url: "https://app/r/vip?ig=ref-esp" }], idempotencyKey: "run-esp:convite" });
  assert.equal((patches[0][1] as { status: string }).status, "done");
});

test("o toque no botão da pergunta conta como resposta, mesmo com outro texto ou sem texto; botão de outro run não", async () => {
  const toque = ambiente({ fluxos: soConfirma, esperando: esperandoRun });
  assert.equal((await tratarEvento(resposta("Quero o link", { metadata: { postbackPayload: "run-esp:pergunta" } }), toque.amb)).kind, "handled");
  assert.equal(toque.chamadas.length, 1);

  const semTexto = ambiente({ fluxos: soConfirma, esperando: esperandoRun });
  const ev = resposta("x", { metadata: { postbackPayload: "run-esp:pergunta" } }) as Extract<EventoZernio, { event: "message.received" }>;
  assert.equal((await tratarEvento({ ...ev, message: { ...ev.message, text: null } }, semTexto.amb)).kind, "handled");

  const velho = ambiente({ fluxos: soConfirma, esperando: esperandoRun });
  assert.equal((await tratarEvento(resposta("Quero o link", { metadata: { postbackPayload: "run-velho:pergunta" } }), velho.amb)).kind, "ignored");
});

test("resposta sem a palavra esperada não retoma: segue o caminho normal e o run continua esperando", async () => {
  const { amb, chamadas, patches } = ambiente({ fluxos: soConfirma, esperando: esperandoRun });
  assert.deepEqual(await tratarEvento(resposta("quanto custa?"), amb), { kind: "ignored", reason: "sem fluxo" });
  assert.equal(chamadas.length, 0);
  assert.equal(patches.length, 0);
});

test("o bloco que esperava sumiu do fluxo publicado: o run para e o direct segue o caminho normal", async () => {
  const semPergunta: Ambiente["fluxosNoAr"] = async () => [{ id: "f-conf", version: 2, published: { ...confirmaDef, nodes: confirmaDef.nodes.filter((n) => n.id !== "pergunta"), edges: [] } }];
  const { amb, patches } = ambiente({ fluxos: semPergunta, esperando: esperandoRun });
  await tratarEvento(resposta("sim"), amb);
  assert.equal((patches[0][1] as { status: string; error_code: string }).error_code, "flow_changed");
});

test("reenvio da mesma resposta: quem perde a reivindicação não manda nada", async () => {
  const { amb, chamadas } = ambiente({ fluxos: soConfirma, esperando: esperandoRun, reivindicado: false });
  assert.deepEqual(await tratarEvento(resposta("sim"), amb), { kind: "ignored", reason: "duplicado" });
  assert.equal(chamadas.length, 0);
});

test("erro passageiro na retomada devolve o run à espera e pede reenvio", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const { amb, patches } = ambiente({ fluxos: soConfirma, esperando: esperandoRun, falhar: { sendMessage: fora } });
  assert.deepEqual(await tratarEvento(resposta("sim"), amb), { kind: "retry", reason: "temporarily_unavailable" });
  assert.deepEqual(patches, [["run-esp", { waiting: "reply" }]]);
});

test("a reivindicação carimba o direct que retomou", async () => {
  const { amb, reivindicacoes } = ambiente({ fluxos: soConfirma, esperando: esperandoRun });
  await tratarEvento(resposta("sim"), amb);
  assert.deepEqual(reivindicacoes, ["m-sim"]);
});

test("reenvio do direct que já retomou um run terminado: duplicado, mesmo com fluxo de direct com a mesma palavra no ar", async () => {
  const comDm: Ambiente["fluxosNoAr"] = async () => [
    { id: "f-conf", version: 1, published: confirmaDef },
    { id: "f-d", version: 1, published: { ...RECIPES.dm_invite.build(), nodes: RECIPES.dm_invite.build().nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) } },
  ];
  const { amb, chamadas, criados } = ambiente({ fluxos: comDm, retomado: { ...esperandoRun, status: "done", waiting: null } });
  assert.deepEqual(await tratarEvento(resposta("quero"), amb), { kind: "ignored", reason: "duplicado" });
  assert.equal(chamadas.length, 0);
  assert.equal(criados.length, 0);
});

test("reenvio enquanto a retomada não gravou desfecho: há pouco pede nova tentativa; parada há mais de 2 min é levada e termina", async () => {
  const emCurso = { ...esperandoRun, waiting: null, updated_at: "2026-10-06T11:59:30Z" };
  assert.deepEqual(await tratarEvento(resposta("sim"), ambiente({ fluxos: soConfirma, retomado: emCurso }).amb), { kind: "retry", reason: "em andamento" });

  const parada = { ...emCurso, updated_at: "2026-10-06T11:50:00Z" };
  const levou = ambiente({ fluxos: soConfirma, retomado: parada });
  assert.deepEqual(await tratarEvento(resposta("sim"), levou.amb), { kind: "handled", tenantId: "loja-a", runId: "run-esp", status: "done" });
  assert.deepEqual(levou.reivindicacoes, [], "já reivindicado pela 1ª tentativa");
  assert.equal(levou.chamadas.length, 1);

  assert.deepEqual(await tratarEvento(resposta("sim"), ambiente({ fluxos: soConfirma, retomado: parada, parado: false }).amb), { kind: "retry", reason: "corrida" });
});

test("reenvio depois de erro passageiro (run de volta à espera) retoma normalmente", async () => {
  const { amb, chamadas, reivindicacoes } = ambiente({ fluxos: soConfirma, retomado: esperandoRun });
  assert.equal((await tratarEvento(resposta("sim"), amb)).kind, "handled");
  assert.deepEqual(reivindicacoes, ["m-sim"]);
  assert.equal(chamadas.length, 1);
});
