import assert from "node:assert/strict";
import test from "node:test";
import { parseEngineTenantId } from "./engine-context";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

test("accepts a valid tenant UUID", () => {
  assert.equal(parseEngineTenantId(TENANT_ID), TENANT_ID);
});

test("rejects a missing or malformed tenant", () => {
  assert.throws(() => parseEngineTenantId(null), /ausente ou inválido/);
  assert.throws(() => parseEngineTenantId("tenant-1"), /ausente ou inválido/);
});
