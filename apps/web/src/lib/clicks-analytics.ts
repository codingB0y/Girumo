import "server-only";
import { promises as fs } from "fs";
import { legacyDataPath } from "@/lib/legacy-data-dir";

// Agregação de cliques por link, lendo data/clicks.ndjson (independente do store.ts).

const CLICKS_FILE = legacyDataPath("clicks.ndjson");

export type ClickAnalytics = {
  total: number;
  byDay: { date: string; count: number }[];
  bySource: { source: string; count: number }[];
};

const DAY_MS = 86_400_000;

export type GlobalClickStats = {
  total: number;
  today: number;
  thisWeek: number;
  lastWeek: number;
  bySource: { source: string; count: number }[];
};

/** Cliques somados de TODOS os links: total, hoje, semana atual vs anterior, origens. */
export async function getGlobalClickStats(): Promise<GlobalClickStats> {
  let raw = "";
  try {
    raw = await fs.readFile(CLICKS_FILE, "utf8");
  } catch {
    return { total: 0, today: 0, thisWeek: 0, lastWeek: 0, bySource: [] };
  }

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const sources = new Map<string, number>();
  let total = 0;
  let today = 0;
  let thisWeek = 0;
  let lastWeek = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev: { ts?: string; utmSource?: string };
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    total++;
    const t = ev.ts ? new Date(ev.ts).getTime() : 0;
    if (t >= todayMs) today++;
    if (t >= now - 7 * DAY_MS) thisWeek++;
    else if (t >= now - 14 * DAY_MS) lastWeek++;
    const src = ev.utmSource || "direto";
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }

  return {
    total,
    today,
    thisWeek,
    lastWeek,
    bySource: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}

export async function getClickAnalytics(slug: string): Promise<ClickAnalytics> {
  let raw = "";
  try {
    raw = await fs.readFile(CLICKS_FILE, "utf8");
  } catch {
    return { total: 0, byDay: [], bySource: [] };
  }

  const days = new Map<string, number>();
  const sources = new Map<string, number>();
  let total = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev: { slug?: string; ts?: string; utmSource?: string };
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.slug !== slug) continue;
    total++;
    const date = (ev.ts ?? "").slice(0, 10) || "—";
    days.set(date, (days.get(date) ?? 0) + 1);
    const src = ev.utmSource || "direto";
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }

  return {
    total,
    byDay: [...days.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    bySource: [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  };
}
