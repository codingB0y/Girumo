import assert from "node:assert/strict";
import {
  summarizeTenantFunnel,
  ACTIVATION_MILESTONES,
  parseFunnelCounts,
  parseTenantFunnelMatrix,
  type TenantFunnelRow,
  type FunnelEvent,
} from "./funnel-summary";

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

// ── Leitura do agregado do banco (D.5) ────────────────────────────────────────

// Conta o que o banco agregou; valor que nao e numero nao vira contagem.
{
  assert.deepEqual(parseFunnelCounts({ signup: 12, first_order: 3 }), { signup: 12, first_order: 3 });
  assert.deepEqual(parseFunnelCounts({ signup: "12" }), {}, "string nao conta");
  assert.deepEqual(parseFunnelCounts({}), {});
}

// Payload ausente ou de outro formato vira vazio, nao excecao.
{
  assert.deepEqual(parseFunnelCounts(null), {});
  assert.deepEqual(parseFunnelCounts(undefined), {});
  assert.deepEqual(parseFunnelCounts([1, 2, 3]), {}, "lista nao e mapa de contagem");
  assert.deepEqual(parseFunnelCounts("nada"), {});
}

// A matriz vem como lista de objetos jsonb, uma linha por tenant.
{
  const linhas = parseTenantFunnelMatrix([
    {
      tenant_id: "t-1",
      name: "Loja A",
      created_at: "2026-08-01T00:00:00+00:00",
      milestones: { signup: "2026-08-01T10:00:00+00:00", first_order: "2026-08-03T10:00:00+00:00" },
    },
  ]);

  assert.deepEqual(linhas, [
    {
      tenantId: "t-1",
      name: "Loja A",
      createdAt: "2026-08-01T00:00:00+00:00",
      milestones: { signup: "2026-08-01T10:00:00+00:00", first_order: "2026-08-03T10:00:00+00:00" },
    },
  ]);
}

// Tenant sem nome mantem o travessao que a tela ja esperava.
{
  const [linha] = parseTenantFunnelMatrix([
    { tenant_id: "t-1", name: null, created_at: "2026-08-01T00:00:00+00:00" },
  ]);
  assert.equal(linha.name, "—");
  assert.deepEqual(linha.milestones, {}, "sem marco = mapa vazio, nao undefined");
}

// Linha sem id ou sem data de criacao nao serve: summarizeTenantFunnel calcula
// idade a partir do createdAt.
{
  const linhas = parseTenantFunnelMatrix([
    { name: "sem id", created_at: "2026-08-01T00:00:00+00:00" },
    { tenant_id: "t-2", name: "sem data" },
    "nao e objeto",
    null,
  ]);
  assert.deepEqual(linhas, []);
}

// Marco cujo valor nao e timestamp em texto e descartado, o resto fica.
{
  const [linha] = parseTenantFunnelMatrix([
    {
      tenant_id: "t-1",
      name: "Loja A",
      created_at: "2026-08-01T00:00:00+00:00",
      milestones: { signup: "2026-08-01T10:00:00+00:00", first_order: 42 },
    },
  ]);
  assert.deepEqual(linha.milestones, { signup: "2026-08-01T10:00:00+00:00" });
}

// Payload ausente vira lista vazia.
{
  assert.deepEqual(parseTenantFunnelMatrix(null), []);
  assert.deepEqual(parseTenantFunnelMatrix(undefined), []);
  assert.deepEqual(parseTenantFunnelMatrix({ nao: "e lista" }), []);
}

console.log("funnel-summary tests passed");
