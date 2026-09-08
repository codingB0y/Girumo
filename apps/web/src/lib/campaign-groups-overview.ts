import type { Group } from "@/lib/mock-data";
import { GROUP_FULL_RATIO } from "@/lib/links/resolve-click-target";

export type CampaignGroupStatus = "available" | "full" | "missing_invite" | "unknown";

/**
 * `orphan_groups` é o caso em que a campanha escolheu grupos e nenhum deles
 * resolve mais em `/api/groups` — apagados no WhatsApp, ou `group_ids` gravado
 * com o uuid da linha em vez do JID. Ele existe porque sem ele esse caso caía
 * no `full`, e a etiqueta anunciava LOTOU para uma campanha que não tem grupo
 * nenhum para lotar. `grow-headroom.ts` já separa os dois do lado do
 * auto-grow: id órfão é dado quebrado, não lotação.
 */
export type CampaignOperationalStatus =
  | "empty"
  | "ready"
  | "needs_invites"
  | "full"
  | "orphan_groups";

export type CampaignPrimaryAction =
  | { kind: "choose_groups" }
  | { kind: "configure_invites" }
  | { kind: "copy_link" }
  | { kind: "add_groups" };

export type CampaignGroupOverview = {
  id: string;
  group: Group | null;
  status: CampaignGroupStatus;
  members: number;
  capacity: number;
  inviteUrl: string;
};

export type CampaignGroupsOverviewInput = {
  campaign: {
    id: string;
    name: string;
    loja?: string;
    groupIds: string[];
    slug?: string;
    createdAt: string;
  };
  groups: Group[];
  clicks?: number;
};

export type CampaignGroupsOverview = {
  campaign: CampaignGroupsOverviewInput["campaign"];
  groups: CampaignGroupOverview[];
  groupCount: number;
  availableCount: number;
  fullCount: number;
  missingInviteCount: number;
  unknownCount: number;
  totalMembers: number;
  totalCapacity: number;
  fillPct: number;
  operationalStatus: CampaignOperationalStatus;
  primaryAction: CampaignPrimaryAction;
  masterLink: string;
  clicks: number;
};

export function getCampaignGroupStatus(group: Group | null | undefined): CampaignGroupStatus {
  if (!group) return "unknown";
  if (!group.inviteUrl) return "missing_invite";
  if (group.members >= group.capacity * GROUP_FULL_RATIO) return "full";
  return "available";
}

export function buildCampaignGroupsOverview(input: CampaignGroupsOverviewInput): CampaignGroupsOverview {
  const groupsById = new Map<string, Group>();
  for (const group of input.groups) {
    groupsById.set(group.id, group);
    groupsById.set(group.whatsappGroupId, group);
  }

  const groupOverviews = input.campaign.groupIds.map((id) => {
    const group = groupsById.get(id) ?? null;
    const status = getCampaignGroupStatus(group);

    return {
      id,
      group,
      status,
      members: group?.members ?? 0,
      capacity: group?.capacity ?? 0,
      inviteUrl: group?.inviteUrl ?? "",
    };
  });

  const groupCount = groupOverviews.length;
  const availableCount = groupOverviews.filter((group) => group.status === "available").length;
  const fullCount = groupOverviews.filter((group) => group.status === "full").length;
  const missingInviteCount = groupOverviews.filter((group) => group.status === "missing_invite").length;
  const unknownCount = groupOverviews.filter((group) => group.status === "unknown").length;
  const totalMembers = groupOverviews.reduce((sum, group) => sum + group.members, 0);
  const totalCapacity = groupOverviews.reduce((sum, group) => sum + group.capacity, 0);
  const fillPct = totalCapacity > 0 ? Math.round((totalMembers * 100) / totalCapacity) : 0;
  const operationalStatus = getOperationalStatus({
    groupCount,
    availableCount,
    missingInviteCount,
    unknownCount,
  });

  return {
    campaign: input.campaign,
    groups: groupOverviews,
    groupCount,
    availableCount,
    fullCount,
    missingInviteCount,
    unknownCount,
    totalMembers,
    totalCapacity,
    fillPct,
    operationalStatus,
    primaryAction: getPrimaryAction(operationalStatus),
    masterLink: input.campaign.slug ? `/r/${input.campaign.slug}` : "",
    clicks: input.clicks ?? 0,
  };
}

/**
 * Os quatro contadores decidem juntos, e a ordem é o desenho.
 *
 * `unknownCount` cede a `ready` e a `needs_invites`: um grupo que funciona faz
 * a campanha funcionar, e o id órfão ao lado é ruído, não a manchete. Mas ganha
 * de `full`, porque sem nenhum grupo utilizável o órfão é a explicação — era
 * daí que vinha o LOTOU sobre "0 / 0 vagas".
 *
 * Com o teste de órfãos no lugar, `return "full"` deixa de ser catch-all: só
 * chega ali quem tem grupo de verdade, cheio.
 */
function getOperationalStatus(input: {
  groupCount: number;
  availableCount: number;
  missingInviteCount: number;
  unknownCount: number;
}): CampaignOperationalStatus {
  if (input.groupCount === 0) return "empty";
  if (input.availableCount > 0) return "ready";
  if (input.missingInviteCount > 0) return "needs_invites";
  if (input.unknownCount > 0) return "orphan_groups";
  return "full";
}

function getPrimaryAction(status: CampaignOperationalStatus): CampaignPrimaryAction {
  if (status === "empty") return { kind: "choose_groups" };
  if (status === "needs_invites") return { kind: "configure_invites" };
  if (status === "ready") return { kind: "copy_link" };
  // Os grupos escolhidos não existem mais: escolher outros é a saída, e
  // "adicionar" pressuporia que os atuais servem para alguma coisa.
  if (status === "orphan_groups") return { kind: "choose_groups" };
  return { kind: "add_groups" };
}
