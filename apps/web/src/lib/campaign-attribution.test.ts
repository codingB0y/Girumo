import assert from "node:assert/strict";
import {
  matchCampaignByGroup,
  matchCampaignId,
  resolveCampaignId,
  type CampaignRef,
} from "./campaign-attribution";

const campaigns: CampaignRef[] = [
  { id: "c1", name: "Saldão Julho", slug: "saldao-julho", group_ids: ["111@g.us"], created_at: "2026-07-01T00:00:00Z" },
  { id: "c2", name: "Novidade", slug: "novidade-abc", group_ids: ["222@g.us"], created_at: "2026-08-01T00:00:00Z" },
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

// Por grupo: JID do grupo de origem dentro de group_ids.
assert.equal(matchCampaignByGroup("222@g.us", campaigns), "c2");
assert.equal(matchCampaignByGroup("999@g.us", campaigns), null);
assert.equal(matchCampaignByGroup(null, campaigns), null);
// group_ids guarda whatsapp id — UUID de `groups` não casa.
assert.equal(matchCampaignByGroup("5f0c7d7e-0000-4000-8000-000000000000", campaigns), null);

// Grupo em várias campanhas: vence a mais antiga, independente da ordem da lista.
const overlap: CampaignRef[] = [
  { id: "new", name: "test 2", slug: "test-2", group_ids: ["333@g.us"], created_at: "2026-09-17T20:04:32Z" },
  { id: "old", name: "test", slug: "test", group_ids: ["333@g.us"], created_at: "2026-09-16T03:43:41Z" },
];
assert.equal(matchCampaignByGroup("333@g.us", overlap), "old");
// Empate de created_at → menor id.
assert.equal(
  matchCampaignByGroup("333@g.us", overlap.map((c) => ({ ...c, created_at: "2026-09-16T00:00:00Z" }))),
  "new",
);

// resolveCampaignId: source_campaign explícito vence; senão, o grupo.
assert.equal(resolveCampaignId({ source_campaign: "novidade-abc", source_group_id: "111@g.us" }, campaigns), "c2");
assert.equal(resolveCampaignId({ source_campaign: null, source_group_id: "111@g.us" }, campaigns), "c1");
assert.equal(resolveCampaignId({ source_campaign: "inexistente", source_group_id: "111@g.us" }, campaigns), "c1");
assert.equal(resolveCampaignId({ source_campaign: null, source_group_id: null }, campaigns), null);

console.log("campaign-attribution tests passed");
