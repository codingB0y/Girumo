import assert from "node:assert/strict";
import test from "node:test";
import { buildManualGrant, buildManualRevoke } from "./manual-grant";
import { subscriptionAccess } from "./subscription-access";

const AGORA = new Date("2026-09-01T12:00:00.000Z");

test("concessao manual produz linha que CONCEDE o plano", () => {
  const row = buildManualGrant({
    tenantId: "t1",
    planId: "p1",
    adminEmail: "admin@girumo.com",
    now: AGORA,
  });

  assert.equal(row.status, "active");
  // O teste que importa nao e o literal acima: e o gate real dizer sim. Se
  // `subscriptionAccess` mudar de opiniao sobre "active", isto quebra aqui e
  // nao no cliente que ficou sem acesso depois de o admin clicar em conceder.
  assert.deepEqual(
    subscriptionAccess(
      { status: row.status, stripeStatus: null, periodEnd: null },
      AGORA,
    ),
    { grantsPlan: true, state: "active" },
  );
});

test("concessao preserva o metadata que ja existia", () => {
  const row = buildManualGrant({
    tenantId: "t1",
    planId: "p1",
    adminEmail: "admin@girumo.com",
    currentMetadata: { stripe_status: "incomplete_expired", outra: 1 },
    now: AGORA,
  });

  // `stripe_status` e lido por `subscriptionAccess` no ramo `unpaid`. Apagar
  // aqui transformaria um boleto pendente em inadimplente na proxima leitura.
  assert.equal(row.metadata.stripe_status, "incomplete_expired");
  assert.equal(row.metadata.outra, 1);
  assert.deepEqual(row.metadata.manual_grant, {
    granted_by: "admin@girumo.com",
    granted_at: AGORA.toISOString(),
    reason: null,
  });
});

test("metadata invalido no jsonb nao vira spread silencioso", () => {
  for (const invalido of ["texto", 42, ["a"], null]) {
    const row = buildManualGrant({
      tenantId: "t1",
      planId: "p1",
      adminEmail: "a@b.com",
      currentMetadata: invalido,
      now: AGORA,
    });
    assert.ok(row.metadata.manual_grant, `metadata quebrou com ${JSON.stringify(invalido)}`);
  }
});

test("razao e aparada e limitada", () => {
  const row = buildManualGrant({
    tenantId: "t1",
    planId: "p1",
    adminEmail: "a@b.com",
    reason: `  ${"x".repeat(400)}  `,
    now: AGORA,
  });
  const trail = row.metadata.manual_grant as { reason: string };
  assert.equal(trail.reason.length, 300);

  const vazia = buildManualGrant({
    tenantId: "t1",
    planId: "p1",
    adminEmail: "a@b.com",
    reason: "   ",
    now: AGORA,
  });
  assert.equal((vazia.metadata.manual_grant as { reason: string | null }).reason, null);
});

test("revogacao NAO concede plano e mantem o rastro de quem concedeu", () => {
  const concedido = buildManualGrant({
    tenantId: "t1",
    planId: "p1",
    adminEmail: "admin@girumo.com",
    reason: "cortesia",
    now: AGORA,
  });

  const depois = new Date("2026-10-01T12:00:00.000Z");
  const row = buildManualRevoke({
    adminEmail: "outro@girumo.com",
    currentMetadata: concedido.metadata,
    now: depois,
  });

  assert.equal(
    subscriptionAccess({ status: row.status, stripeStatus: null, periodEnd: null }, depois)
      .grantsPlan,
    false,
  );
  assert.deepEqual(row.metadata.manual_grant, {
    granted_by: "admin@girumo.com",
    granted_at: AGORA.toISOString(),
    reason: "cortesia",
    revoked_by: "outro@girumo.com",
    revoked_at: depois.toISOString(),
  });
});
