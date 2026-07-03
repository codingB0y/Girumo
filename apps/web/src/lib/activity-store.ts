import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { LEGACY_DATA_DIR } from "@/lib/legacy-data-dir";
import { tenantDataPath } from "@/lib/tenant-data-path";

// Atividade dos grupos reportada pela engine (snapshot do dia). Mede "grupo vivo
// que vende" vs "grupo lotado e morto". Guarda só CONTAGEM (sem PII dos membros).
const activityFile = (tenantId: string) => tenantDataPath(LEGACY_DATA_DIR, tenantId, "activity.json");

export type GroupActivity = {
  groupId: string;
  name: string;
  date: string; // YYYY-MM-DD do snapshot
  messages: number;
  activeMembers: number;
  lastMessageAt: string | null;
  updatedAt: string;
};

export async function listActivity(tenantId: string): Promise<GroupActivity[]> {
  try {
    return JSON.parse((await fs.readFile(activityFile(tenantId), "utf8")) || "[]") as GroupActivity[];
  } catch {
    return [];
  }
}

export type ActivitySnapshot = {
  whatsappGroupId: string;
  name: string;
  date: string;
  messages: number;
  activeMembers: number;
  lastMessageAt: string | null;
};

/** Upsert do snapshot mais recente por grupo (substitui o do mesmo grupo). */
export async function upsertActivity(tenantId: string, snapshots: ActivitySnapshot[]): Promise<void> {
  const file = activityFile(tenantId);
  return withFileLock(file, async () => {
    const cur = await listActivity(tenantId);
    const byId = new Map(cur.map((a) => [a.groupId, a]));
    const now = new Date().toISOString();
    for (const s of snapshots) {
      if (!s.whatsappGroupId) continue;
      byId.set(s.whatsappGroupId, {
        groupId: s.whatsappGroupId,
        name: s.name,
        date: s.date,
        messages: Number(s.messages) || 0,
        activeMembers: Number(s.activeMembers) || 0,
        lastMessageAt: s.lastMessageAt ?? null,
        updatedAt: now,
      });
    }
    await writeFileAtomic(file, JSON.stringify([...byId.values()], null, 2));
  });
}
