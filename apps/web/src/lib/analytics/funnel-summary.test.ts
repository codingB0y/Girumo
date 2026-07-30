import assert from "node:assert/strict";
import { summarizeTenantFunnel, ACTIVATION_MILESTONES, type TenantFunnelRow, type FunnelEvent } from "./funnel-summary";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-07-29T00:00:00.000Z");
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString();

function row(createdDaysAgo: number, milestones: Partial<Record<FunnelEvent, string>>): TenantFunnelRow {
  return { tenantId: "t1", name: "Loja", createdAt: daysAgo(createdDaysAgo), milestones };
}

// goal_set não é passo linear do funil.
assert.ok(!ACTIVATION_MILESTONES.some((m) => m.event === "goal_set"), "goal_set fora do caminho linear");
assert.equal(ACTIVATION_MILESTONES[ACTIVATION_MILESTONES.length - 1].event, "first_order", "terminal = first_order");

// Conta nova, só signup → 1 marco, não parado, não ativado.
{
  const s = summarizeTenantFunnel(row(2, { signup: daysAgo(2) }), now);
  assert.equal(s.ageDays, 2);
  assert.equal(s.reachedCount, 1);
  assert.equal(s.furthest, "signup");
  assert.equal(s.activated, false);
  assert.equal(s.isStuck, false);
  assert.equal(s.daysSinceProgress, 2);
  assert.equal(s.goalSet, false);
}

// Parado: último marco há 8 dias, não ativado → isStuck true.
{
  const s = summarizeTenantFunnel(
    row(10, {
      signup: daysAgo(10),
      qr_connected: daysAgo(9),
      first_campaign_created: daysAgo(8),
      first_lead_captured: daysAgo(8),
    }),
    now,
  );
  assert.equal(s.reachedCount, 4);
  assert.equal(s.furthest, "first_lead_captured");
  assert.equal(s.daysSinceProgress, 8);
  assert.equal(s.isStuck, true);
}

// Exatamente no limite (5 dias) NÃO é parado; >5 é.
{
  const at5 = summarizeTenantFunnel(row(6, { signup: daysAgo(6), qr_connected: daysAgo(5) }), now);
  assert.equal(at5.daysSinceProgress, 5);
  assert.equal(at5.isStuck, false);
  const at6 = summarizeTenantFunnel(row(7, { signup: daysAgo(7), qr_connected: daysAgo(6) }), now);
  assert.equal(at6.daysSinceProgress, 6);
  assert.equal(at6.isStuck, true);
}

// Ativado (first_order) nunca conta como parado, mesmo com marco antigo.
{
  const s = summarizeTenantFunnel(
    row(30, {
      signup: daysAgo(30),
      qr_connected: daysAgo(29),
      first_campaign_created: daysAgo(28),
      first_lead_captured: daysAgo(27),
      leads_50: daysAgo(25),
      first_order: daysAgo(20),
    }),
    now,
  );
  assert.equal(s.activated, true);
  assert.equal(s.reachedCount, 6);
  assert.equal(s.isStuck, false);
}

// Marcos com buracos: pulou campanha/lead/50 e foi direto ao 1º pedido.
{
  const s = summarizeTenantFunnel(
    row(10, { signup: daysAgo(10), qr_connected: daysAgo(9), first_order: daysAgo(1) }),
    now,
  );
  assert.equal(s.reachedCount, 3);
  assert.equal(s.furthest, "first_order");
  assert.equal(s.activated, true);
  assert.equal(s.isStuck, false);
}

// goal_set marca o indicador sem virar passo do caminho linear.
{
  const s = summarizeTenantFunnel(row(3, { signup: daysAgo(3), qr_connected: daysAgo(2), goal_set: daysAgo(2) }), now);
  assert.equal(s.goalSet, true);
  assert.equal(s.reachedCount, 2);
}

console.log("funnel-summary tests passed");
