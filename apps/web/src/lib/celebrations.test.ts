import assert from "node:assert/strict";
import { computeCelebrations, pendingCelebrations, type CelebrationSignals } from "./celebrations";

const base: CelebrationSignals = { fullGroups: [], monthlyGoal: null, contacts: 0, ordersCount: 0 };

// Nada atingido → vazio.
assert.deepEqual(computeCelebrations(base), []);

// Grupo cheio → 1 marco com key por grupo.
{
  const c = computeCelebrations({ ...base, fullGroups: [{ id: "g1", name: "VIP", members: 247 }] });
  assert.equal(c.length, 1);
  assert.equal(c[0].key, "group_full:g1");
  assert.equal(c[0].stat, 247);
}

// Meta batida (contatos >= meta).
{
  assert.equal(computeCelebrations({ ...base, monthlyGoal: 50, contacts: 49 }).length, 0);
  const c = computeCelebrations({ ...base, monthlyGoal: 50, contacts: 60 });
  assert.equal(c.find((x) => x.key === "goal_hit")?.stat, 60);
}
// Meta nula ou zero não celebra.
assert.equal(computeCelebrations({ ...base, monthlyGoal: 0, contacts: 100 }).length, 0);

// Pedidos: só o MAIOR marco atingido.
{
  const c = computeCelebrations({ ...base, ordersCount: 120 });
  const orderKeys = c.filter((x) => x.key.startsWith("orders_")).map((x) => x.key);
  assert.deepEqual(orderKeys, ["orders_100"]);
}
assert.equal(computeCelebrations({ ...base, ordersCount: 9 }).filter((x) => x.key.startsWith("orders_")).length, 0);

// pendingCelebrations remove os já celebrados.
{
  const all = computeCelebrations({ ...base, ordersCount: 10, monthlyGoal: 5, contacts: 5 });
  const pend = pendingCelebrations(all, new Set(["orders_10"]));
  assert.ok(!pend.some((c) => c.key === "orders_10"));
  assert.ok(pend.some((c) => c.key === "goal_hit"));
}

console.log("celebrations tests passed");
