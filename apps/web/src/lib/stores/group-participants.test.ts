import { strict as assert } from "node:assert";
import { test } from "node:test";
import { montarQueryParticipantes } from "./group-participants";

test("toda leitura filtra por tenant_id", () => {
  const q = montarQueryParticipantes("tenant-abc");
  assert.equal(q.tenantId, "tenant-abc");
});

test("tenant vazio e recusado antes de tocar o banco", () => {
  assert.throws(() => montarQueryParticipantes(""), /tenant/i);
});
