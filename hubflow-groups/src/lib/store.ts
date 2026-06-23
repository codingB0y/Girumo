import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";

// Persistência simples em arquivo (MVP). Migrar para Postgres/Prisma depois.
// links.json   -> definição dos links rastreados
// clicks.ndjson -> 1 clique por linha (append-only, seguro para gravações concorrentes)

const DATA_DIR = path.join(process.cwd(), "data");
const LINKS_FILE = path.join(DATA_DIR, "links.json");
const CLICKS_FILE = path.join(DATA_DIR, "clicks.ndjson");

export type TrackedLink = {
  id: string;
  slug: string;
  destinationUrl: string;
  targetGroupName: string;
  campaignName: string;
  /** Pixel do Facebook — dispara evento "Lead" antes de redirecionar (otimiza anúncio). */
  pixelId?: string;
  /** Teto de cliques humanos: ao atingir, /r/:slug para de redirecionar (grupo "cheio"). */
  clickCap?: number;
  createdAt: string;
};

export type ClickEvent = {
  slug: string;
  ts: string;
  utmSource?: string;
  utmCampaign?: string;
  ref?: string;
  ua?: string;
  /** Grupo (JID) p/ onde o clique foi roteado — preenchido no link mestre de campanha. */
  target?: string;
};

async function ensure() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(LINKS_FILE);
  } catch {
    await fs.writeFile(LINKS_FILE, "[]");
  }
  try {
    await fs.access(CLICKS_FILE);
  } catch {
    await fs.writeFile(CLICKS_FILE, "");
  }
}

export async function listLinks(): Promise<TrackedLink[]> {
  await ensure();
  const raw = await fs.readFile(LINKS_FILE, "utf8");
  return JSON.parse(raw || "[]") as TrackedLink[];
}

export async function getLink(slug: string): Promise<TrackedLink | null> {
  const links = await listLinks();
  return links.find((l) => l.slug === slug) ?? null;
}

export async function createLink(
  input: Omit<TrackedLink, "id" | "createdAt">,
): Promise<TrackedLink> {
  await ensure();
  return withFileLock(LINKS_FILE, async () => {
    const links = await listLinks();
    if (links.some((l) => l.slug === input.slug)) {
      throw new Error("Já existe um link com esse slug.");
    }
    const link: TrackedLink = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    links.push(link);
    await writeFileAtomic(LINKS_FILE, JSON.stringify(links, null, 2));
    return link;
  });
}

export async function recordClick(ev: ClickEvent): Promise<void> {
  await ensure();
  await fs.appendFile(CLICKS_FILE, JSON.stringify(ev) + "\n");
}

/** Eventos de clique crus (com timestamp) — base p/ atribuição por janela. */
export async function listClicks(): Promise<ClickEvent[]> {
  await ensure();
  const raw = await fs.readFile(CLICKS_FILE, "utf8");
  const out: ClickEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as ClickEvent);
    } catch {
      // ignora linha corrompida
    }
  }
  return out;
}

export async function clickCounts(): Promise<Record<string, number>> {
  await ensure();
  const raw = await fs.readFile(CLICKS_FILE, "utf8");
  const counts: Record<string, number> = {};
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as ClickEvent;
      counts[ev.slug] = (counts[ev.slug] ?? 0) + 1;
    } catch {
      // ignora linha corrompida
    }
  }
  return counts;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
