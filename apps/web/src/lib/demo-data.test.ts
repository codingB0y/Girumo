import assert from "node:assert/strict";
import test from "node:test";
import { demoScenario } from "./demo-data";

test("o cenário demo contém uma operação conectada e coerente", () => {
  assert.equal(demoScenario.connection.status, "connected");
  assert.ok(demoScenario.groups.length >= 3);
  assert.ok(demoScenario.contacts.length >= 4);
  assert.ok(demoScenario.campaign.groupIds.every((id) => demoScenario.groups.some((group) => group.id === id)));
  assert.equal(demoScenario.metrics.contacts, demoScenario.contacts.length);
});
