import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { housekeepingDidWork, runHousekeeping, type HousekeepingSummary } from "./housekeeping.js";

type RpcCall = { fn: string; args: Record<string, unknown> };
type RpcResult = { data?: unknown; error?: { message: string; code?: string } };

/** Supabase fake: registra as RPCs chamadas e devolve o que o teste mandar. */
function fakeSupabase(results: Record<string, RpcResult>, calls: RpcCall[]): SupabaseClient {
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      const result = results[fn] ?? { data: 0 };
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
  return client as unknown as SupabaseClient;
}

test("housekeeping chama requeue_expired_commands — a etapa que a F4 esquecia", async () => {
  const calls: RpcCall[] = [];
  const supabase = fakeSupabase(
    {
      requeue_expired_commands: { data: 3 },
      reconcile_broadcast_progress: { data: 2 },
      promote_due_schedules: { data: 1 },
    },
    calls,
  );

  const summary = await runHousekeeping(supabase);

  assert.deepEqual(
    calls.map((c) => c.fn),
    ["requeue_expired_commands", "reconcile_broadcast_progress", "promote_due_schedules"],
  );
  assert.deepEqual(summary, { requeued: 3, reconciled: 2, promoted: 1, pruned: 0 });
});

test("requeue roda ANTES do reconciliador (lease vencido não pode contar como concluído)", async () => {
  const calls: RpcCall[] = [];
  await runHousekeeping(fakeSupabase({}, calls));

  const requeueIdx = calls.findIndex((c) => c.fn === "requeue_expired_commands");
  const reconcileIdx = calls.findIndex((c) => c.fn === "reconcile_broadcast_progress");
  assert.ok(requeueIdx >= 0 && reconcileIdx >= 0);
  assert.ok(requeueIdx < reconcileIdx, "requeue precisa vir antes do reconciliador");
});

test("prune só roda quando pedido (é caro para cada tick de 3s)", async () => {
  const semPrune: RpcCall[] = [];
  await runHousekeeping(fakeSupabase({}, semPrune));
  assert.ok(!semPrune.some((c) => c.fn === "prune_instance_sends"));

  const comPrune: RpcCall[] = [];
  const summary = await runHousekeeping(
    fakeSupabase({ prune_instance_sends: { data: 12 } }, comPrune),
    { prune: true },
  );
  const prune = comPrune.find((c) => c.fn === "prune_instance_sends");
  assert.ok(prune);
  assert.equal(prune.args.older_than, "25 hours");
  assert.equal(summary.pruned, 12);
});

test("função ausente no banco (migration não aplicada) vira no-op, não erro", async () => {
  const calls: RpcCall[] = [];
  const supabase = fakeSupabase(
    {
      requeue_expired_commands: { data: 5 },
      // worker novo contra banco antigo: estas duas ainda não existem
      reconcile_broadcast_progress: { error: { message: "not found", code: "PGRST202" } },
      promote_due_schedules: { error: { message: "undefined function", code: "42883" } },
    },
    calls,
  );

  const summary = await runHousekeeping(supabase);

  // A etapa que existe continua funcionando — degradação parcial, não queda total.
  assert.equal(summary.requeued, 5);
  assert.equal(summary.reconciled, 0);
  assert.equal(summary.promoted, 0);
});

test("erro real de banco sobe (o index marca o worker unhealthy)", async () => {
  const supabase = fakeSupabase(
    { requeue_expired_commands: { error: { message: "connection reset", code: "08006" } } },
    [],
  );

  await assert.rejects(() => runHousekeeping(supabase), /requeue_expired_commands: connection reset/);
});

test("housekeepingDidWork só é true quando alguma etapa mexeu em algo", () => {
  const zero: HousekeepingSummary = { requeued: 0, reconciled: 0, promoted: 0, pruned: 0 };
  assert.equal(housekeepingDidWork(zero), false);
  assert.equal(housekeepingDidWork({ ...zero, reconciled: 1 }), true);
  assert.equal(housekeepingDidWork({ ...zero, pruned: 4 }), true);
});
