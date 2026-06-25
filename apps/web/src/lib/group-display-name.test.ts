import assert from "node:assert/strict";
import { getGroupDisplayName, hasInternalGroupName } from "./group-display-name";
import type { Group } from "@/lib/mock-data";

const baseGroup: Group = {
  id: "g1",
  whatsappGroupId: "g1",
  name: "Nome real do WhatsApp",
  members: 10,
  capacity: 100,
  selected: false,
  engagement: "medio",
};

assert.equal(getGroupDisplayName({ ...baseGroup, displayNameBase: "Promocoes", displayNumber: 1 }), "Promocoes 1");
assert.equal(getGroupDisplayName({ ...baseGroup, displayNameBase: "VIP" }), "VIP");
assert.equal(getGroupDisplayName({ ...baseGroup, displayNameBase: "  Atacado  ", displayNumber: 2 }), "Atacado 2");
assert.equal(getGroupDisplayName(baseGroup), "Nome real do WhatsApp");
assert.equal(hasInternalGroupName({ ...baseGroup, displayNameBase: "Promocoes" }), true);
assert.equal(hasInternalGroupName(baseGroup), false);

console.log("group-display-name tests passed");
