import assert from "node:assert/strict";
import { test } from "node:test";

import { regraDaVendedora } from "./postar-vendedora";

const CAMP = ["g1", "g2"];
const GRUPO_FORA = "Grupo fora da campanha.";
const RECORRENTE = "Agendamento recorrente só pelo dono ou pela equipe.";

test("vendedora: grupo fora da campanha é barrado", () => {
  assert.equal(regraDaVendedora({ role: "seller", groupIds: ["g1", "g9"], campGroupIds: CAMP, recurrence: "none" }), GRUPO_FORA);
  assert.equal(regraDaVendedora({ role: "seller", groupIds: [9], campGroupIds: CAMP, recurrence: "none" }), GRUPO_FORA);
});

test("vendedora: grupos da campanha, vazio ou ausente passam", () => {
  for (const groupIds of [["g1"], ["g1", "g2"], [], undefined, null, "g9"]) {
    assert.equal(regraDaVendedora({ role: "seller", groupIds, campGroupIds: CAMP, recurrence: "none" }), null, String(groupIds));
  }
});

test("vendedora: recorrência é barrada, sem recorrência passa", () => {
  for (const recurrence of ["daily", "weekly"]) {
    assert.equal(regraDaVendedora({ role: "seller", groupIds: undefined, campGroupIds: CAMP, recurrence }), RECORRENTE, recurrence);
  }
  assert.equal(regraDaVendedora({ role: "seller", groupIds: undefined, campGroupIds: CAMP, recurrence: "none" }), null);
});

test("outros papéis não são afetados", () => {
  for (const role of ["owner", "admin", "operator"] as const) {
    assert.equal(regraDaVendedora({ role, groupIds: ["g9"], campGroupIds: CAMP, recurrence: "weekly" }), null, role);
  }
});
