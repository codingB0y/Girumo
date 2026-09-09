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

// Campanha cujos grupos saíram de /api/groups: apagados no WhatsApp, ou
// `group_ids` gravado com o uuid da linha em vez do JID (dado assim existe em
// dev). Antes deste teste os quatro contadores existiam mas só três chegavam a
// `getOperationalStatus`, e o `return "full"` final era um catch-all: a
// etiqueta dizia LOTOU com "0 / 0 vagas" ao lado. `grow-headroom.ts` já tinha
// decidido a mesma questão do outro lado do domínio — id órfão é dado
// quebrado, não lotação.
const orfaoOverview = buildCampaignGroupsOverview({
  campaign: { ...input.campaign, groupIds: ["sumiu1", "sumiu2"] },
  groups: baseGroups,
});
assert.equal(orfaoOverview.unknownCount, 2);
assert.equal(orfaoOverview.operationalStatus, "orphan_groups");
assert.equal(orfaoOverview.primaryAction.kind, "choose_groups");
// A contradição que a captura de tela mostraria: lotação zero sob o chip LOTOU.
assert.equal(orfaoOverview.totalCapacity, 0);

// Mutante: subir o teste de órfãos acima de `availableCount > 0`. Um grupo que
// funciona faz a campanha funcionar — o id órfão ao lado é ruído, não a
// manchete, e roubar o chip "Pronta" dela seria trocar uma mentira por outra.
const orfaoComVaga = buildCampaignGroupsOverview({
  campaign: { ...input.campaign, groupIds: ["g1", "sumiu"] },
  groups: baseGroups,
});
assert.equal(orfaoComVaga.unknownCount, 1);
assert.equal(orfaoComVaga.operationalStatus, "ready");

// Mutante: subir o teste de órfãos acima do `fullCount > 0`. Com um grupo real
// cheio no meio, `totalMembers / totalCapacity` sai dos grupos que resolveram —
// a etiqueta mostra "195 / 200 vagas". Anunciar "Grupos sumiram" sobre esses
// números trocaria uma contradição por outra, que é o oposto do conserto.
// O órfão só é a manchete quando os números ao lado são "0 / 0".
const orfaoComCheio = buildCampaignGroupsOverview({
  campaign: { ...input.campaign, groupIds: ["g2", "sumiu"] },
  groups: baseGroups,
});
assert.equal(orfaoComCheio.fullCount, 1);
assert.equal(orfaoComCheio.unknownCount, 1);
assert.equal(orfaoComCheio.totalMembers, 195);
assert.equal(orfaoComCheio.totalCapacity, 200);
assert.equal(orfaoComCheio.operationalStatus, "full");
assert.equal(orfaoComCheio.primaryAction.kind, "add_groups");

// Mutante: trocar `fullCount > 0` por `>= 0`, que faria toda campanha sem
// disponível e sem missing_invite virar "full" — de volta ao catch-all que
// causou o defeito. A campanha só-órfã acima é quem mata esse.
//
// Mutante: apagar o `groupCount === 0` inicial. Campanha sem grupo nenhum tem
// os quatro contadores zerados e cairia no `return` final, virando
// "orphan_groups" — "Grupos sumiram" para quem nunca escolheu grupo.
assert.equal(emptyOverview.unknownCount, 0);
assert.equal(emptyOverview.operationalStatus, "empty");
assert.equal(overview.unknownCount, 0);
assert.equal(overview.operationalStatus, "ready");

console.log("campaign-groups-overview tests passed");
