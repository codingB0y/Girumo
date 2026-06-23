import { collection } from "@/lib/json-collection";
import { crudRoute } from "@/lib/crud-route";
import type { Campaign, CampaignStatus } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coll = collection<Campaign>("broadcasts.json");

function parsePoll(raw: unknown): { question: string; options: string[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as { question?: unknown; options?: unknown };
  const question = String(p.question ?? "").trim();
  const options = Array.isArray(p.options) ? p.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 12) : [];
  if (!question || options.length < 2) return undefined;
  return { question, options };
}

export const { GET, POST, DELETE } = crudRoute<Campaign>(coll, (b) => {
  // Exige nome e (mensagem OU foto OU enquete válida).
  if (!b.name || (!b.message && !b.mediaId && !parsePoll(b.poll)))
    return { error: "Informe um nome e uma mensagem, foto ou enquete." };
  const groupIds = Array.isArray(b.groupIds) ? b.groupIds.map(String) : [];
  return {
    name: String(b.name),
    message: String(b.message ?? ""),
    groupIds,
    mediaId: b.mediaId ? String(b.mediaId) : undefined,
    mediaType: b.mediaId ? (b.mediaType === "video" ? ("video" as const) : ("image" as const)) : undefined,
    mentionAll: b.mentionAll === true,
    poll: parsePoll(b.poll),
    status: "draft" as CampaignStatus,
    sent: 0,
    total: groupIds.length, // 1 mensagem por grupo
    createdAt: new Date().toISOString(),
  };
});
