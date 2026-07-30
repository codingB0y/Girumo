import assert from "node:assert/strict";
import { matchCampaignId, type CampaignRef } from "./campaign-attribution";

const campaigns: CampaignRef[] = [
  { id: "c1", name: "Saldão Julho", slug: "saldao-julho" },
  { id: "c2", name: "Novidade", slug: "novidade-abc" },
];

// Casa por slug.
assert.equal(matchCampaignId("saldao-julho", campaigns), "c1");
// Casa por nome (case/trim insensível).
assert.equal(matchCampaignId("  SALDÃO JULHO ", campaigns), "c1");
assert.equal(matchCampaignId("Novidade", campaigns), "c2");
// Sem match → null (sem origem).
assert.equal(matchCampaignId("outra coisa", campaigns), null);
// Vazio/nulo → null.
assert.equal(matchCampaignId(null, campaigns), null);
assert.equal(matchCampaignId(undefined, campaigns), null);
assert.equal(matchCampaignId("   ", campaigns), null);

console.log("campaign-attribution tests passed");
