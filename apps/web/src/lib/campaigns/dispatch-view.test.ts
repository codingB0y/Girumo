import assert from "node:assert/strict";
import {
  buildDispatchList,
  buildTenantDispatchList,
  indexSchedulesByBroadcast,
  resolveDispatchType,
  toDispatchView,
  type BroadcastRow,
  type ScheduleRow,
} from "./dispatch-view";

const broadcast = (over: Partial<BroadcastRow> & { id: string }): BroadcastRow => ({
  campaign_group_id: "cg1",
  name: "Campanha",
  message: "oferta",
  group_ids: ["a@g.us"],
  media_id: null,
  media_type: null,
  media_name: null,
  mention_all: false,
  poll: null,
  status: "draft",
  sent: 0,
  total: 1,
  error: null,
  dispatched_at: null,
  running_since: null,
  last_ack_at: null,
  created_at: "2026-08-10T10:00:00.000Z",
  ...over,
});

const schedule = (over: Partial<ScheduleRow> & { id: string }): ScheduleRow => ({
  broadcast_id: "b1",
  scheduled_at: "2026-08-11T10:00:00.000Z",
  recurrence: "none",
  status: "pending",
  ...over,
});

// --- tipo derivado do conteúdo --------------------------------------------

assert.equal(resolveDispatchType({ poll: null, media_type: null, media_id: null }), "text");
assert.equal(resolveDispatchType({ poll: { question: "q", options: ["a", "b"] }, media_type: "image", media_id: "m" }), "poll");
assert.equal(resolveDispatchType({ poll: null, media_type: "video", media_id: "m" }), "video");
assert.equal(resolveDispatchType({ poll: null, media_type: "audio", media_id: "m" }), "audio");
assert.equal(resolveDispatchType({ poll: null, media_type: "file", media_id: "m" }), "file");
// Mídia sem tipo declarado cai em imagem (mesma regra da aba antiga).
assert.equal(resolveDispatchType({ poll: null, media_type: null, media_id: "m" }), "image");
// Tipo inválido não vaza pro contrato.
assert.equal(resolveDispatchType({ poll: null, media_type: "sticker", media_id: "m" }), "image");

// --- status ---------------------------------------------------------------

// Draft + agendamento pendente aparece como "scheduled" (é o que o lojista lê).
const agendado = toDispatchView(broadcast({ id: "b1" }), "camp", schedule({ id: "s1" }));
assert.equal(agendado.status, "scheduled");
assert.equal(agendado.scheduledAt, "2026-08-11T10:00:00.000Z");
assert.equal(agendado.scheduleId, "s1");

// Sem agendamento, vale o status do broadcast.
assert.equal(toDispatchView(broadcast({ id: "b1", status: "queued" }), "camp", null).status, "queued");
assert.equal(toDispatchView(broadcast({ id: "b1", status: "running" }), "camp", null).status, "running");

// Agendamento já promovido (done) não segura o status em "scheduled".
const promovido = toDispatchView(
  broadcast({ id: "b1", status: "running" }),
  "camp",
  schedule({ id: "s1", status: "done" }),
);
assert.equal(promovido.status, "running");
assert.equal(promovido.scheduledAt, undefined);
assert.equal(promovido.recurrence, "none");

// Broadcast já enfileirado NÃO volta a "scheduled" só porque sobrou agendamento pendente.
assert.equal(
  toDispatchView(broadcast({ id: "b1", status: "queued" }), "camp", schedule({ id: "s1" })).status,
  "queued",
);

// --- progresso e mídia preservados ----------------------------------------

const enviado = toDispatchView(
  broadcast({
    id: "b1",
    status: "sent",
    sent: 3,
    total: 4,
    media_id: "up1",
    media_type: "image",
    media_name: "oferta.png",
    error: "1 grupo falhou",
    dispatched_at: "2026-08-10T11:00:00.000Z",
  }),
  "camp",
  null,
);
assert.equal(enviado.sent, 3);
assert.equal(enviado.total, 4);
assert.equal(enviado.mediaId, "up1");
assert.equal(enviado.mediaType, "image");
assert.equal(enviado.mediaName, "oferta.png");
assert.equal(enviado.error, "1 grupo falhou");
assert.equal(enviado.dispatchedAt, "2026-08-10T11:00:00.000Z");

// --- índice de agendamentos ------------------------------------------------

// Entre dois pendentes do mesmo broadcast, fica o mais cedo.
const idx = indexSchedulesByBroadcast([
  schedule({ id: "s2", scheduled_at: "2026-08-12T10:00:00.000Z" }),
  schedule({ id: "s1", scheduled_at: "2026-08-11T10:00:00.000Z" }),
]);
assert.equal(idx.get("b1")?.id, "s1");

// Pendente ganha de concluído, mesmo chegando depois.
const idx2 = indexSchedulesByBroadcast([
  schedule({ id: "sdone", status: "done", scheduled_at: "2026-08-01T10:00:00.000Z" }),
  schedule({ id: "spend", scheduled_at: "2026-08-20T10:00:00.000Z" }),
]);
assert.equal(idx2.get("b1")?.id, "spend");

// Agendamento sem broadcast (legado de campaign_message) é ignorado.
assert.equal(indexSchedulesByBroadcast([schedule({ id: "s1", broadcast_id: null })]).size, 0);

// --- lista -----------------------------------------------------------------

const lista = buildDispatchList(
  [
    broadcast({ id: "b1", created_at: "2026-08-10T10:00:00.000Z" }),
    broadcast({ id: "b2", created_at: "2026-08-10T12:00:00.000Z" }),
  ],
  [schedule({ id: "s1", broadcast_id: "b2" })],
  "camp",
);
// Mais recente primeiro.
assert.deepEqual(lista.map((d) => d.id), ["b2", "b1"]);
assert.equal(lista[0].status, "scheduled");
assert.equal(lista[1].status, "draft");

// --- lista do tenant inteiro (/painel/disparos) ----------------------------

const campanhasPorId = new Map([
  ["cg1", { name: "Saldão Julho", slug: "saldao-julho" }],
  ["cg2", { name: "Novidade", slug: "novidade" }],
]);

const doTenant = buildTenantDispatchList(
  [
    broadcast({ id: "b1", campaign_group_id: "cg1", created_at: "2026-08-10T10:00:00.000Z" }),
    broadcast({ id: "b2", campaign_group_id: "cg2", created_at: "2026-08-10T12:00:00.000Z" }),
  ],
  [],
  campanhasPorId,
);
// Mais recente primeiro, cada linha com a SUA campanha.
assert.deepEqual(doTenant.map((d) => [d.id, d.campaignName, d.campaignSlug]), [
  ["b2", "Novidade", "novidade"],
  ["b1", "Saldão Julho", "saldao-julho"],
]);

// Campanha apagada não some do histórico — aparece com rótulo neutro.
const orfao = buildTenantDispatchList([broadcast({ id: "b9", campaign_group_id: "sumiu" })], [], campanhasPorId);
assert.equal(orfao[0].campaignName, "Campanha removida");
assert.equal(orfao[0].campaignSlug, "");

// Disparo sem campanha nenhuma também não some.
const semCampanha = buildTenantDispatchList([broadcast({ id: "b8", campaign_group_id: null })], [], campanhasPorId);
assert.equal(semCampanha[0].campaignName, "Campanha removida");

// Agendamento continua sendo resolvido na visão do tenant.
const agendadoTenant = buildTenantDispatchList(
  [broadcast({ id: "b1", campaign_group_id: "cg1" })],
  [schedule({ id: "s1", broadcast_id: "b1" })],
  campanhasPorId,
);
assert.equal(agendadoTenant[0].status, "scheduled");
assert.equal(agendadoTenant[0].scheduleId, "s1");

console.log("dispatch-view tests passed");
