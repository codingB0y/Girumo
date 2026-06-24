import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { legacyDataPath } from "@/lib/legacy-data-dir";

// Status REAL da sessão do WhatsApp, reportado pela engine (heartbeat a cada 30s).
const SESSION_FILE = legacyDataPath("session.json");

export type SessionStatus = "connected" | "disconnected";

// Stats que a engine JÁ calcula no terminal e agora manda no heartbeat.
export type EngineStats = {
  queue: {
    pendentes: number;
    enviadasUltimoMinuto: number;
    enviadasUltimaHora: number;
    enviadasHoje: number;
    pausada: boolean;
  };
  delivery: { sentInWindow: number; deliveredInWindow: number; deliveryRate: number | null };
  warmup: {
    phase: "warming" | "graduated";
    day: number;
    totalDays: number;
    todayLimit: number | string;
    todaySent: number;
  };
};

export type SessionInfo = {
  status: SessionStatus;
  phone: string | null;
  profileName: string | null;
  connectedSince: string | null;
  stats: EngineStats | null;
  updatedAt: string;
};

const DEFAULT: SessionInfo = {
  status: "disconnected",
  phone: null,
  profileName: null,
  connectedSince: null,
  stats: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getSession(): Promise<SessionInfo> {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export async function setSession(info: Partial<SessionInfo>): Promise<SessionInfo> {
  return withFileLock(SESSION_FILE, async () => {
    const merged: SessionInfo = {
      ...(await getSession()),
      ...info,
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(SESSION_FILE, JSON.stringify(merged, null, 2));
    return merged;
  });
}

/** "Ao vivo" = conectada E com heartbeat recente (engine viva). */
export function isLive(info: SessionInfo): boolean {
  return info.status === "connected" && Date.now() - new Date(info.updatedAt).getTime() < 90_000;
}
