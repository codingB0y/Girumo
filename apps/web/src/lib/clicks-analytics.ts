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
