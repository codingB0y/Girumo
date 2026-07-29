import assert from "node:assert/strict";
import test from "node:test";

import {
  runAutomationsTick,
  type AutomationDeps,
  type AutomationRow,
  type AutomationRunRow,
  type EnqueueMessageInput,
} from "./automations-loop.js";

const TENANT = "11111111-1111-1111-1111-111111111111";

/** Supabase fake: só o suficiente pra runAutomationsTick (requeue + claim). */
function fakeSupabase(runs: AutomationRunRow[], requeued = 0) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  return {
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      if (name === "requeue_stale_automation_runs") return Promise.resolve({ data: requeued, error: null });
      if (name === "claim_automation_runs") return Promise.resolve({ data: runs, error: null });
      throw new Error(`rpc inesperado no fake: ${name}`);
    },
    rpcCalls,
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

/** Deps fake que registram chamadas, para asserir a lógica sem banco. */
function fakeDeps(overrides: {
  automation?: AutomationRow | null;
  enqueueError?: Error;
} = {}) {
  const enqueued: EnqueueMessageInput[] = [];
  const advances: { runId: string; nextStep: number; nextAt: Date }[] = [];
  const finishes: { runId: string; status: string; error?: string }[] = [];

  const automation: AutomationRow = overrides.automation === undefined
    ? { id: "auto-1", enabled: true, steps: [] }
    : (overrides.automation as AutomationRow);

  const deps: AutomationDeps = {
    async getAutomation() {
      return overrides.automation === undefined ? automation : overrides.automation;
    },
    async enqueueMessage(input) {
      if (overrides.enqueueError) throw overrides.enqueueError;
      enqueued.push(input);
    },
    async advance(runId, nextStep, nextAt) {
      advances.push({ runId, nextStep, nextAt });
    },
    async finish(runId, status, error) {
      finishes.push({ runId, status, error });
    },
  };

  return { deps, enqueued, advances, finishes };
}

function runRow(overrides: Partial<AutomationRunRow> = {}): AutomationRunRow {
  return {
    id: "run-1",
    tenant_id: TENANT,
    automation_id: "auto-1",
    target_group_jid: "120363000000000000@g.us",
    current_step: 0,
    ...overrides,
  };
}

test("passo wait avanca sem enfileirar mensagem, agendando pelo delay", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "wait", delay_minutes: 5 }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow()]);

  const before = Date.now();
  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.advanced, 1);
  assert.equal(f.enqueued.length, 0);
  assert.equal(f.advances.length, 1);
  assert.equal(f.advances[0].nextStep, 1);
  assert.ok(f.advances[0].nextAt.getTime() >= before + 5 * 60_000);
});

test("passo message enfileira no grupo alvo e avanca imediatamente", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "message", delay_minutes: 0, message: "oi grupo" }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow({ current_step: 0 })]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.advanced, 1);
  assert.equal(f.enqueued.length, 1);
  assert.equal(f.enqueued[0].targetGroupJid, "120363000000000000@g.us");
  assert.equal(f.enqueued[0].text, "oi grupo");
  assert.equal(f.enqueued[0].stepIndex, 0);
  assert.equal(f.advances[0].nextStep, 1);
});

test("current_step >= steps.length finaliza como done", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "message", delay_minutes: 0, message: "oi" }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow({ current_step: 1 })]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.done, 1);
  assert.equal(f.finishes[0].status, "done");
  assert.equal(f.enqueued.length, 0);
});

test("automacao desligada no meio cancela o run em vez de disparar o passo", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: false,
    steps: [{ id: "s1", type: "message", delay_minutes: 0, message: "oi" }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow()]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.cancelled, 1);
  assert.equal(f.finishes[0].status, "cancelled");
  assert.equal(f.enqueued.length, 0);
});

test("automacao nao encontrada falha o run", async () => {
  const f = fakeDeps({ automation: null });
  const supabase = fakeSupabase([runRow()]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.failed, 1);
  assert.equal(f.finishes[0].status, "failed");
  assert.match(f.finishes[0].error ?? "", /nao encontrada/);
});

test("passo condition falha explicito (sem avaliador implementado)", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "condition", delay_minutes: 0, condition: "algo" }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow()]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.failed, 1);
  assert.equal(f.enqueued.length, 0);
  assert.match(f.finishes[0].error ?? "", /condition/);
});

test("tipo de passo desconhecido falha o run", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "banana", delay_minutes: 0 }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow()]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.failed, 1);
  assert.match(f.finishes[0].error ?? "", /tipo desconhecido/);
});

test("message sem texto falha em vez de enfileirar vazio", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "message", delay_minutes: 0, message: "   " }],
  };
  const f = fakeDeps({ automation });
  const supabase = fakeSupabase([runRow()]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.failed, 1);
  assert.equal(f.enqueued.length, 0);
});

test("erro isolado por run: um run falho nao derruba os demais no mesmo ciclo", async () => {
  const automation: AutomationRow = {
    id: "auto-1",
    enabled: true,
    steps: [{ id: "s1", type: "message", delay_minutes: 0, message: "oi" }],
  };
  const f = fakeDeps({ automation, enqueueError: new Error("engine_commands fora do ar") });
  const supabase = fakeSupabase([runRow({ id: "run-1" }), runRow({ id: "run-2" })]);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.claimed, 2);
  assert.equal(summary.failed, 2);
  assert.equal(f.finishes.length, 2);
  assert.match(f.finishes[0].error ?? "", /engine_commands fora do ar/);
});

test("requeue conta no resumo do ciclo", async () => {
  const f = fakeDeps();
  const supabase = fakeSupabase([], 3);

  const summary = await runAutomationsTick(supabase, f.deps, 10, 300);

  assert.equal(summary.requeued, 3);
  assert.equal(summary.claimed, 0);
});

test("claim propaga erro de banco (nao isola no nivel do ciclo)", async () => {
  const f = fakeDeps();
  const supabase = {
    rpc(name: string) {
      if (name === "requeue_stale_automation_runs") return Promise.resolve({ data: 0, error: null });
      if (name === "claim_automation_runs") return Promise.resolve({ data: null, error: { message: "banco fora" } });
      throw new Error(`rpc inesperado: ${name}`);
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  await assert.rejects(() => runAutomationsTick(supabase, f.deps, 10, 300), /claim_automation_runs: banco fora/);
});
