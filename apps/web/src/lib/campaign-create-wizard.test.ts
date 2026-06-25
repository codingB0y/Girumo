import assert from "node:assert/strict";
import { getCreateWizardGroups } from "./campaign-create-wizard";
import type { Group } from "@/lib/mock-data";

const groups: Group[] = [
  {
    id: "full",
    whatsappGroupId: "full",
    name: "Grupo cheio",
    members: 980,
    capacity: 1000,
    selected: false,
    engagement: "medio",
    inviteUrl: "https://chat.whatsapp.com/full",
  },
  {
    id: "missing",
    whatsappGroupId: "missing",
    name: "Grupo sem convite",
    members: 120,
    capacity: 1000,
    selected: false,
    engagement: "medio",
  },
  {
    id: "available",
    whatsappGroupId: "available",
    name: "Grupo disponivel",
    members: 200,
    capacity: 1000,
    selected: false,
    engagement: "medio",
    inviteUrl: "https://chat.whatsapp.com/available",
  },
];

const result = getCreateWizardGroups(groups);

assert.deepEqual(result.available.map((group) => group.id), ["available"]);
assert.deepEqual(result.needsAttention.map((group) => group.id), ["missing", "full"]);
assert.equal(result.hasAvailableGroups, true);

const emptyResult = getCreateWizardGroups([]);
assert.deepEqual(emptyResult.available, []);
assert.deepEqual(emptyResult.needsAttention, []);
assert.equal(emptyResult.hasAvailableGroups, false);

console.log("campaign-create-wizard tests passed");
