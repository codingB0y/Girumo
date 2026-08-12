import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateLegacyTenantData, planLegacyMigration } from "./migrate-legacy-tenant-data";

test("recusa tenant inválido", () => {
  assert.throws(() => planLegacyMigration("tenant-1", "C:/tmp/data"));
});

test("copia para backup e tenant preservando o original", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hubflow-legacy-"));
  const tenantId = "11111111-1111-4111-8111-111111111111";
  try {
    await fs.writeFile(path.join(root, "leads.ndjson"), '{"id":"lead-1"}\n');
    const result = await migrateLegacyTenantData(planLegacyMigration(tenantId, root));

    assert.equal(await fs.readFile(path.join(root, "leads.ndjson"), "utf8"), '{"id":"lead-1"}\n');
    assert.equal(
      await fs.readFile(path.join(root, "tenants", tenantId, "leads.ndjson"), "utf8"),
      '{"id":"lead-1"}\n',
    );
    assert.equal(await fs.readFile(path.join(result.backup, "leads.ndjson"), "utf8"), '{"id":"lead-1"}\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("planeja backup e destino sem remover originais", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  // `planLegacyMigration` faz `path.resolve(dataDir)`, e "C:/tmp/data" só é
  // absoluto no Windows — no Linux é um caminho relativo (uma pasta chamada
  // "C:"), então o resolve prefixa o cwd e a igualdade cravada nunca bate.
  // Derivar o esperado da mesma base mantém o teste honesto nos dois sistemas.
  const base = path.resolve(os.tmpdir(), "hubflow-plan");
  const plan = planLegacyMigration(tenantId, base);
  assert.equal(
    plan.destination.replaceAll("\\", "/"),
    path.join(base, "tenants", tenantId).replaceAll("\\", "/"),
  );
  assert.deepEqual(plan.files, ["leads.ndjson", "optout.json", "welcome.json"]);
  assert.equal(plan.deleteOriginals, false);
});
