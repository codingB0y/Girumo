import type { Group } from "@/lib/mock-data";

export function getGroupDisplayName(group: Group): string {
  const base = group.displayNameBase?.trim();
  if (!base) return group.name;
  if (!group.displayNumber || group.displayNumber <= 0) return base;
  return `${base} ${group.displayNumber}`;
}

export function hasInternalGroupName(group: Group): boolean {
  return !!group.displayNameBase?.trim();
}
