import assert from "node:assert/strict";
import test from "node:test";

import {
  groupFullCandidates,
  groupStalledCandidates,
  runAutomationScansTick,
  weeklyRecurringCandidates,
  type AutomationRow,
  type GroupScanRow,
  type ScanCandidate,
  type ScanDeps,
} from "./automation-scans.js";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

function group(overrides: Partial<GroupScanRow> = {}): GroupScanRow {
  return {
    id: "group-1",
    whatsappGroupId: "120363000000000001@g.us",
    members: 50,
    capacity: 200,
    hasRecentLead: true,
    ...overrides,
  };
}

function automation(tenantId: string, id = "auto-1"): AutomationRow {
  return { id, tenant_id: tenantId };
}

test("groupFullCandidates: só grupos com members >= capacity", () => {
  const groups = new Map([
    [TENANT_A, [group({ id: "g-full", members: 200, capacity: 200 }), group({ id: "g-ok", members: 50, capacity: 200 })]],
  ]);
  const candidates = groupFullCandidates([automation(TENANT_A)], groups);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].targetGroupJid, "120363000000000001@g.us");
  assert.equal(candidates[0].dedupeKey, "group_full:g-full:auto-1");
});

test("groupStalledCandidates: só grupos sem lead recente", () => {
  const groups = new Map([
    [TENANT_A, [group({ id: "g-stale", hasRecentLead: false }), group({ id: "g-fresh", hasRecentLead: true })]],
  ]);
  const candidates = groupStalledCandidates([automation(TENANT_A)], groups);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].dedupeKey, "group_stalled:g-stale:auto-1");
});

test("weeklyRecurringCandidates: fan-out incondicional pra todos os grupos do tenant, com data no dedupe_key", () => {
  const groups = new Map([[TENANT_A, [group({ id: "g1" }), group({ id: "g2" })]]]);
  const candidates = weeklyRecurringCandidates([automation(TENANT_A)], groups, "2026-07-29");
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].dedupeKey, "weekly:g1:auto-1:2026-07-29");
  assert.equal(candidates[1].dedupeKey, "weekly:g2:auto-1:2026-07-29");
});

test("automação de um tenant nunca casa grupo de outro tenant", () => {
  const groups = new Map([
    [TENANT_A, [group({ id: "g-a", members: 200, capacity: 200 })]],
    [TENANT_B, [group({ id: "g-b", members: 200, capacity: 200 })]],
  ]);
  const candidates = groupFullCandidates([automation(TENANT_A, "auto-a")], groups);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].targetGroupJid, group({ id: "g-a" }).whatsappGroupId);
  assert.equal(candidates[0].tenantId, TENANT_A);
});

/** ScanDeps fake: automações/grupos pré-resolvidos, createRun registra chamadas e simula dedupe. */
function fakeScanDeps(input: {
  groupFull?: AutomationRow[];
  groupStalled?: AutomationRow[];
  weeklyRecurring?: AutomationRow[];
  groupsByTenant?: Map<string, GroupScanRow[]>;
  alreadyExists?: Set<string>;
}) {
  const created: ScanCandidate[] = [];
  const alreadyExists = input.alreadyExists ?? new Set<string>();

  const deps: ScanDeps = {
    async listGroupFullAutomations() {
      return input.groupFull ?? [];
    },
    async listGroupStalledAutomations() {
      return input.groupStalled ?? [];
    },
    async listWeeklyRecurringAutomations() {
      return input.weeklyRecurring ?? [];
    },
    async listGroupsByTenant() {
      return input.groupsByTenant ?? new Map();
    },
    async createRun(candidate) {
      if (alreadyExists.has(candidate.dedupeKey)) return false;
      created.push(candidate);
      return true;
    },
  };

  return { deps, created };
}

test("runAutomationScansTick: soma criados por categoria", async () => {
  const groups = new Map([
    [
      TENANT_A,
      [
        group({ id: "g-full", members: 200, capacity: 200, hasRecentLead: true }),
        group({ id: "g-stale", members: 10, capacity: 200, hasRecentLead: false }),
      ],
    ],
  ]);
  const f = fakeScanDeps({
    groupFull: [automation(TENANT_A, "auto-full")],
    groupStalled: [automation(TENANT_A, "auto-stalled")],
    weeklyRecurring: [automation(TENANT_A, "auto-weekly")],
    groupsByTenant: groups,
  });

  const summary = await runAutomationScansTick(f.deps, new Date("2026-07-29T00:00:00Z"));

  assert.equal(summary.groupFullCreated, 1);
  assert.equal(summary.groupStalledCreated, 1);
  // weekly faz fan-out pros 2 grupos do tenant, incondicional.
  assert.equal(summary.weeklyRecurringCreated, 2);
  assert.equal(f.created.length, 4);
});

test("runAutomationScansTick: dedupe_key existente nao conta como criado", async () => {
  const groups = new Map([[TENANT_A, [group({ id: "g-full", members: 200, capacity: 200 })]]]);
  const f = fakeScanDeps({
    groupFull: [automation(TENANT_A)],
    groupsByTenant: groups,
    alreadyExists: new Set(["group_full:g-full:auto-1"]),
  });

  const summary = await runAutomationScansTick(f.deps, new Date());

  assert.equal(summary.groupFullCreated, 0);
  assert.equal(f.created.length, 0);
});

test("runAutomationScansTick: sem automacoes habilitadas, nao cria nada e nao quebra", async () => {
  const f = fakeScanDeps({});
  const summary = await runAutomationScansTick(f.deps, new Date());
  assert.deepEqual(summary, { groupFullCreated: 0, groupStalledCreated: 0, weeklyRecurringCreated: 0 });
});
