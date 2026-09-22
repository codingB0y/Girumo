import assert from "node:assert/strict";
import { buildFunnelResults, type OfferTotals } from "./results";

const linha = (
  id: string,
  run: string | undefined,
  criado: string,
  extra: Partial<{ status: string; sent: number; total: number; body: string; scheduledAt: string; dispatchedAt: string; template: string }> = {},
) => ({
  id,
  funnelRunId: run,
  funnelTemplateId: run ? (extra.template ?? "live") : undefined,
  createdAt: criado,
  status: extra.status ?? "scheduled",
  sent: extra.sent ?? 0,
  total: extra.total ?? 13,
  body: extra.body,
  scheduledAt: extra.scheduledAt,
  dispatchedAt: extra.dispatchedAt,
});

const oferta: OfferTotals = {
  broadcastId: "b3",
  slots: 12,
  pediram: 38,
  atendidas: 12,
  vendeu: 9,
  desistiram: 3,
};

const live = buildFunnelResults(
  [
    linha("b3", "r1", "2026-09-21T17:12:19Z", { status: "sent", sent: 13, body: "Grade da live liberada\nsegunda linha" }),
    linha("b1", "r1", "2026-09-21T17:12:17Z", { status: "sent", sent: 13 }),
    linha("solta", undefined, "2026-09-21T17:12:30Z"),
    linha("b4", "r1", "2026-09-21T17:12:20Z", { status: "sent", sent: 11 }),
    linha("b2", "r1", "2026-09-21T17:12:18Z", { status: "sent", sent: 13 }),
  ],
  [oferta],
);

assert.equal(live.length, 1, "mensagem fora de funil nao vira funil");
const r = live[0];
assert.equal(r.label, "Lançamento de live");
// 4 etapas, na ordem de criacao, com os nomes do roteiro.
assert.deepEqual(r.steps.map((s) => s.id), ["b1", "b2", "b3", "b4"]);
assert.deepEqual(r.steps.map((s) => s.label), [
  "Prévia da grade",
  "Entra agora",
  "Grade da live",
  "Sobras da live",
]);
// So a 1a linha do texto entra na lista.
assert.equal(r.steps[2].body, "Grade da live liberada");
// A oferta fica na etapa dela e tambem no topo do funil.
assert.equal(r.steps[2].offer?.pediram, 38);
assert.equal(r.steps[0].offer, undefined);
assert.equal(r.offer?.vendeu, 9);
assert.equal(r.enviadas, 4);
assert.equal(r.gruposEntregues, 50);
assert.equal(r.gruposAlvo, 52);

// Etapa desmarcada: a contagem nao bate com o roteiro, entao nao da pra nomear
// por posicao (a 2a mensagem nao e a 2a etapa). Generico em vez de nome errado.
const parcial = buildFunnelResults([
  linha("x1", "r2", "2026-09-21T18:00:01Z"),
  linha("x2", "r2", "2026-09-21T18:00:02Z"),
]);
assert.deepEqual(parcial[0].steps.map((s) => s.label), ["Etapa 1", "Etapa 2"]);
assert.equal(parcial[0].label, "Lançamento de live");

// Roteiro sumido (dado antigo) nao quebra.
const antigo = buildFunnelResults([linha("z", "r3", "2026-09-20T10:00:00Z", { template: "sumiu" })]);
assert.equal(antigo[0].label, "Funil");
assert.equal(antigo[0].steps[0].label, "Etapa 1");

// Mais novo primeiro, e o horario mostrado e o do disparo quando ja saiu.
const dois = buildFunnelResults([
  linha("a", "velho", "2026-09-19T10:00:00Z", { scheduledAt: "2026-09-19T12:00:00Z" }),
  linha("b", "novo", "2026-09-21T10:00:00Z", { status: "sent", scheduledAt: "2026-09-21T12:00:00Z", dispatchedAt: "2026-09-21T12:00:09Z" }),
]);
assert.deepEqual(dois.map((f) => f.runId), ["novo", "velho"]);
assert.equal(dois[0].steps[0].at, "2026-09-21T12:00:09Z");
assert.equal(dois[1].steps[0].at, "2026-09-19T12:00:00Z");
assert.equal(dois[1].enviadas, 0);

console.log("funnels/results tests passed");
