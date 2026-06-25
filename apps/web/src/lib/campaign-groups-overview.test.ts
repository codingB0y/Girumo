import assert from "node:assert/strict";
import {
  buildCampaignGroupsOverview,
  getCampaignGroupStatus,
  type CampaignGroupsOverviewInput,
} from "./campaign-groups-overview";

const baseGroups = [
  { id: "g1", whatsappGroupId: "g1", name: "Grupo 1", members: 100, capacity: 200, selected: false, engagement: "medio" as const, inviteUrl: "https://chat.whatsapp.com/one" },
  { id: "g2", whatsappGroupId: "g2", name: "Grupo 2", members: 195, capacity: 200, selected: false, engagement: "medio" as const, inviteUrl: "https://chat.whatsapp.com/two" },
  { id: "g3", whatsappGroupId: "g3", name: "Grupo 3", members: 50, capacity: 200, selected: false, engagement: "medio" as const },
];

const input: CampaignGroupsOverviewInput = {
  campaign: { id: "c1", name: "Inverno", loja: "Virei Moda", groupIds: ["g1", "g2", "g3"], slug: "inverno", createdAt: "2026-06-25T00:00:00.000Z" },
  groups: baseGroups,
  clicks: 12,
};

const overview = buildCampaignGroupsOverview(input);

assert.equal(getCampaignGroupStatus(baseGroups[0]), "available");
assert.equal(getCampaignGroupStatus(baseGroups[1]), "full");
assert.equal(getCampaignGroupStatus(baseGroups[2]), "missing_invite");
assert.equal(overview.groupCount, 3);
assert.equal(overview.availableCount, 1);
assert.equal(overview.fullCount, 1);
assert.equal(overview.missingInviteCount, 1);
assert.equal(overview.totalMembers, 345);
assert.equal(overview.totalCapacity, 600);
assert.equal(overview.fillPct, 58);
assert.equal(overview.operationalStatus, "ready");
assert.equal(overview.primaryAction.kind, "copy_link");
assert.equal(overview.masterLink, "/r/inverno");
assert.equal(overview.clicks, 12);

const emptyOverview = buildCampaignGroupsOverview({ campaign: { ...input.campaign, groupIds: [] }, groups: baseGroups });
assert.equal(emptyOverview.operationalStatus, "empty");
assert.equal(emptyOverview.primaryAction.kind, "choose_groups");

const missingInviteOverview = buildCampaignGroupsOverview({ campaign: { ...input.campaign, groupIds: ["g3"] }, groups: baseGroups });
assert.equal(missingInviteOverview.operationalStatus, "needs_invites");
assert.equal(missingInviteOverview.primaryAction.kind, "configure_invites");

const fullOverview = buildCampaignGroupsOverview({ campaign: { ...input.campaign, groupIds: ["g2"] }, groups: baseGroups });
assert.equal(fullOverview.operationalStatus, "full");
assert.equal(fullOverview.primaryAction.kind, "add_groups");

console.log("campaign-groups-overview tests passed");
