import "server-only";
import { promises as fs } from "fs";
import type { Group } from "@/lib/mock-data";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { LEGACY_DATA_DIR } from "@/lib/legacy-data-dir";
import { tenantDataPath } from "@/lib/tenant-data-path";

// Grupos REAIS sincronizados pela engine (substitui a lista a cada sync).
const groupsFile = (tenantId: string) => tenantDataPath(LEGACY_DATA_DIR, tenantId, "groups.json");

// Capacidade padrão de grupo do WhatsApp (até a engine reportar o limite real).
export const DEFAULT_CAPACITY = 1024;
// Grupo é "cheio" ao atingir esta fração da capacidade (deixa folga p/ não estourar).
export const GROUP_FULL_RATIO = 0.95;

export type SyncGroupInput = {
  whatsappGroupId: string;
  name: string;
  members: number;
  /** Opcionais: a engine pode reportar (item 4-5 do épico); senão preservamos o que houver. */
  inviteUrl?: string;
  capacity?: number;
};

export async function listGroups(tenantId: string): Promise<Group[]> {
  try {
    const raw = await fs.readFile(groupsFile(tenantId), "utf8");
    return JSON.parse(raw || "[]") as Group[];
  } catch {
    return [];
  }
}

/**
 * Sync da engine: substitui a lista, mas PRESERVA os campos definidos pelo painel
 * (inviteUrl, capacity) por grupo que ainda existe — senão um sync apagaria o que
 * o lojista configurou. Valor da engine, quando vier, tem precedência.
 */
export async function replaceGroups(tenantId: string, input: SyncGroupInput[]): Promise<Group[]> {
  const file = groupsFile(tenantId);
  return withFileLock(file, async () => {
    const prev = await listGroups(tenantId);
    const prevById = new Map(prev.map((g) => [g.whatsappGroupId, g]));
    const groups: Group[] = input.map((g) => {
      const old = prevById.get(g.whatsappGroupId);
      return {
        id: g.whatsappGroupId,
        name: g.name,
        whatsappGroupId: g.whatsappGroupId,
        members: g.members,
        capacity: g.capacity ?? old?.capacity ?? DEFAULT_CAPACITY,
        selected: old?.selected ?? false,
        engagement: old?.engagement ?? "medio",
        inviteUrl: g.inviteUrl ?? old?.inviteUrl,
        displayNameBase: old?.displayNameBase,
        displayNumber: old?.displayNumber,
      };
    });
    await writeFileAtomic(file, JSON.stringify(groups, null, 2));
    return groups;
  });
}

/** Painel define o convite/capacidade de um grupo (necessário p/ o roteamento). */
export async function updateGroup(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Group, "inviteUrl" | "capacity" | "displayNameBase" | "displayNumber">>,
): Promise<Group | null> {
  const file = groupsFile(tenantId);
  return withFileLock(file, async () => {
    const groups = await listGroups(tenantId);
    const g = groups.find((x) => x.whatsappGroupId === id);
    if (!g) return null;
    if (patch.inviteUrl !== undefined) g.inviteUrl = patch.inviteUrl || undefined;
    if (patch.capacity !== undefined && patch.capacity > 0) g.capacity = patch.capacity;
    if (patch.displayNameBase !== undefined) g.displayNameBase = patch.displayNameBase.trim() || undefined;
    if (patch.displayNumber !== undefined) g.displayNumber = patch.displayNumber > 0 ? patch.displayNumber : undefined;
    await writeFileAtomic(file, JSON.stringify(groups, null, 2));
    return g;
  });
}

/**
 * Adiciona OU atualiza um único grupo sem apagar os demais (usado quando a engine cria
 * um grupo novo via auto-grow — diferente do sync, que substitui a lista inteira).
 */
export async function upsertGroup(tenantId: string, g: {
  whatsappGroupId: string;
  name: string;
  members: number;
  inviteUrl?: string;
  capacity?: number;
}): Promise<Group> {
  const file = groupsFile(tenantId);
  return withFileLock(file, async () => {
    const groups = await listGroups(tenantId);
    let rec = groups.find((x) => x.whatsappGroupId === g.whatsappGroupId);
    if (rec) {
      rec.name = g.name;
      rec.members = g.members;
      if (g.inviteUrl) rec.inviteUrl = g.inviteUrl;
      if (g.capacity && g.capacity > 0) rec.capacity = g.capacity;
    } else {
      rec = {
        id: g.whatsappGroupId,
        name: g.name,
        whatsappGroupId: g.whatsappGroupId,
        members: g.members,
        capacity: g.capacity ?? DEFAULT_CAPACITY,
        selected: false,
        engagement: "medio",
        inviteUrl: g.inviteUrl,
      };
      groups.push(rec);
    }
    await writeFileAtomic(file, JSON.stringify(groups, null, 2));
    return rec;
  });
}

/** Grupo está disponível p/ receber gente: tem convite e ainda não atingiu 95% da capacidade. */
export function isGroupAvailable(g: Group): boolean {
  return !!g.inviteUrl && g.members < g.capacity * GROUP_FULL_RATIO;
}

/**
 * Próximo grupo DISPONÍVEL na ordem do pool (preenchimento sequencial = "lota sozinho":
 * enche o 1º até ~95%, transborda pro próximo). Pula cheios e os sem convite. null = todos cheios.
 */
export function nextAvailableGroup(groupIds: string[], groups: Group[]): Group | null {
  const byId = new Map(groups.map((g) => [g.whatsappGroupId, g]));
  for (const id of groupIds) {
    const g = byId.get(id);
    if (g && isGroupAvailable(g)) return g;
  }
  return null;
}
