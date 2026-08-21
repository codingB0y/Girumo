import assert from "node:assert/strict";
import test from "node:test";

import { distinctTenantIds } from "./grow-tenants.js";

test("um tenant com várias campanhas de auto-grow aparece uma vez só", () => {
  // Sem o dedupe o tenant seria varrido 3× por ciclo, e o teto anti-ban de
  // "1 criação por tenant por ciclo" viraria 3 sem ninguém perceber.
  const ids = distinctTenantIds([{ tenant_id: "t-a" }, { tenant_id: "t-a" }, { tenant_id: "t-a" }]);

  assert.deepEqual(ids, ["t-a"]);
});

test("ordena para a varredura ser estável entre ciclos", () => {
  const ids = distinctTenantIds([{ tenant_id: "t-c" }, { tenant_id: "t-a" }, { tenant_id: "t-b" }]);

  assert.deepEqual(ids, ["t-a", "t-b", "t-c"]);
});

test("linha sem tenant_id utilizável é descartada, não vira tenant vazio", () => {
  // Um "" na lista viraria x-tenant-id vazio e a rota devolveria 400 todo ciclo.
  const ids = distinctTenantIds([{ tenant_id: "t-a" }, { tenant_id: "" }, { tenant_id: null }, {}]);

  assert.deepEqual(ids, ["t-a"]);
});

test("sem campanha de auto-grow devolve lista vazia", () => {
  assert.deepEqual(distinctTenantIds([]), []);
});
