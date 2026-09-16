import { strict as assert } from "node:assert";
import { test } from "node:test";
import { montarQueryComunidades } from "./communities";

test("toda leitura filtra por tenant_id", () => {
  const q = montarQueryComunidades("tenant-abc");
  assert.equal(q.tenantId, "tenant-abc");
});

test("tenant vazio e recusado antes de tocar o banco", () => {
  assert.throws(() => montarQueryComunidades(""), /tenant/i);
});
