import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOverview } from "./overview";
import type { FunnelResult, FunnelResultStep } from "./results";

const campaign = { slug: "kids", name: "Kids Atacado" };

function passo(id: string, status: string, at?: string): FunnelResultStep {
  return { id, index: 1, label: id, body: "", at, status, sent: status === "sent" ? 1 : 0, total: 1 };
}

function run(runId: string, steps: FunnelResultStep[]): FunnelResult & { campaign: typeof campaign } {
  return {
    runId, templateId: "grade-do-dia", label: "Grade do dia", startedAt: "2026-09-20T10:00:00Z", steps,
    enviadas: steps.filter((s) => s.status === "sent").length, gruposEntregues: 0, gruposAlvo: 0, campaign,
  };
}

test("com etapa agendada é agendado; pendentes são só as agendadas; quando = a próxima", () => {
  const { agendados, enviados } = buildOverview([
    run("r1", [passo("a", "sent", "2026-09-30T11:00:00Z"), passo("b", "scheduled", "2026-09-30T15:00:00Z"), passo("c", "scheduled", "2026-09-30T11:12:00Z")]),
  ]);
  assert.equal(enviados.length, 0);
  assert.deepEqual(agendados[0].pendentes, ["b", "c"]);
  assert.equal(agendados[0].quando, "2026-09-30T11:12:00Z");
});

test("etapa saindo agora (queued/running) segura o funil em agendados, sem entrar no cancelar", () => {
  const { agendados, enviados } = buildOverview([
    run("so-saindo", [passo("a", "queued", "2026-09-30T11:00:00Z")]),
    run("meio", [passo("b", "sent", "2026-09-30T11:00:00Z"), passo("c", "running", "2026-09-30T11:12:00Z")]),
  ]);
  assert.equal(enviados.length, 0);
  assert.deepEqual(agendados.map((r) => r.runId).sort(), ["meio", "so-saindo"]);
  assert.ok(agendados.every((r) => r.pendentes.length === 0));
});

test("tudo saído é enviado, com a última saída", () => {
  const { agendados, enviados } = buildOverview([
    run("r1", [passo("a", "sent", "2026-09-28T11:00:00Z"), passo("b", "sent", "2026-09-28T15:00:00Z")]),
  ]);
  assert.equal(agendados.length, 0);
  assert.equal(enviados[0].quando, "2026-09-28T15:00:00Z");
  assert.deepEqual(enviados[0].pendentes, []);
});

test("funil todo cancelado antes de sair não aparece", () => {
  const { agendados, enviados } = buildOverview([run("r1", [passo("a", "cancelled"), passo("b", "draft")])]);
  assert.equal(agendados.length + enviados.length, 0);
});

test("agendados do mais próximo ao mais longe; enviados do mais recente ao mais antigo", () => {
  const { agendados, enviados } = buildOverview([
    run("longe", [passo("a", "scheduled", "2026-10-10T11:00:00Z")]),
    run("perto", [passo("b", "scheduled", "2026-09-30T11:00:00Z")]),
    run("velho", [passo("c", "sent", "2026-09-01T11:00:00Z")]),
    run("novo", [passo("d", "sent", "2026-09-20T11:00:00Z")]),
  ]);
  assert.deepEqual(agendados.map((r) => r.runId), ["perto", "longe"]);
  assert.deepEqual(enviados.map((r) => r.runId), ["novo", "velho"]);
});
