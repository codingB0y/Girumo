import type { Group } from "@/lib/mock-data";

const GROUP_FULL_RATIO = 0.95;

export type CreateWizardGroups = {
  available: Group[];
  needsAttention: Group[];
  hasAvailableGroups: boolean;
};

export function getCreateWizardGroups(groups: Group[]): CreateWizardGroups {
  const available: Group[] = [];
  const needsAttention: Group[] = [];

  for (const group of groups) {
    if (group.inviteUrl && group.members < group.capacity * GROUP_FULL_RATIO) {
      available.push(group);
    } else {
      needsAttention.push(group);
    }
  }

  available.sort(sortByMembersDesc);
  needsAttention.sort(sortByMembersAsc);

  return {
    available,
    needsAttention,
    hasAvailableGroups: available.length > 0,
  };
}

function sortByMembersDesc(a: Group, b: Group) {
  return b.members - a.members;
}

function sortByMembersAsc(a: Group, b: Group) {
  return a.members - b.members;
}
