import assert from "node:assert/strict";
import test from "node:test";
import { tenantDataPath } from "./tenant-data-path";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

test("builds a tenant-scoped legacy data path", () => {
  const path = tenantDataPath("data", TENANT_ID, "leads.ndjson");
  assert.match(
    path.replaceAll("\\", "/"),
    /tenants\/11111111-1111-4111-8111-111111111111\/leads\.ndjson$/,
  );
});

test("rejects invalid tenants and path traversal", () => {
  assert.throws(() => tenantDataPath("data", "tenant-1", "leads.ndjson"));
  assert.throws(() => tenantDataPath("data", TENANT_ID, "../leads.ndjson"));
});
