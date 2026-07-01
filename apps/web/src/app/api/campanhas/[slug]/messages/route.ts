import { collection } from "@/lib/json-collection";
import { createMessage, listByCampaign, removeMessage } from "@/lib/messages-store";
import type { CampaignMessage } from "@/lib/messages-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
const campanhas = collection<Campanha>("campanhas.json");

async function resolveCampaign(slug: string): Promise<Campanha | null> {
  const list = await campanhas.list();
  return list.find((c) => c.slug === slug || c.id === slug) ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await resolveCampaign(slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const messages = await listByCampaign(camp.id);
  return Response.json(messages);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await resolveCampaign(slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const messageBody = String(body.body ?? "").trim();
  const poll = parsePoll(body.poll);

  // Exige texto OU mídia OU enquete
  if (!messageBody && !body.mediaId && !poll) {
    return Response.json({ error: "Informe uma mensagem, mídia ou enquete." }, { status: 400 });
  }

  const groupIds = Array.isArray(body.groupIds) && body.groupIds.length > 0
    ? body.groupIds.map(String)
    : camp.groupIds;

  const type = resolveType(body);

  const msg = await createMessage({
    campaignId: camp.id,
    campaignSlug: camp.slug ?? camp.id,
    type,
    body: messageBody,
    groupIds,
    mediaId: body.mediaId ? String(body.mediaId) : undefined,
    mediaType: resolveMediaType(body),
    mediaName: body.mediaName ? String(body.mediaName) : undefined,
    poll,
    mentionAll: body.mentionAll === true,
    scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
    recurrence: (["none", "daily", "weekly"].includes(String(body.recurrence ?? "")) ? String(body.recurrence) : "none") as CampaignMessage["recurrence"],
  });

  return Response.json(msg, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const ok = await removeMessage(id);
  if (!ok) return Response.json({ error: "Mensagem não encontrada ou em andamento." }, { status: 404 });
  return Response.json({ ok: true });
}

// --- helpers ---

function parsePoll(raw: unknown): { question: string; options: string[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as { question?: unknown; options?: unknown };
  const question = String(p.question ?? "").trim();
  const options = Array.isArray(p.options) ? p.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 12) : [];
  if (!question || options.length < 2) return undefined;
  return { question, options };
}

function resolveType(body: Record<string, unknown>): CampaignMessage["type"] {
  if (body.poll) return "poll";
  if (body.mediaType === "audio") return "audio";
  if (body.mediaType === "file") return "file";
  if (body.mediaType === "video") return "video";
  if (body.mediaType === "image") return "image";
  if (body.mediaId) return "image";
  return "text";
}

function resolveMediaType(body: Record<string, unknown>): CampaignMessage["mediaType"] {
  if (!body.mediaId) return undefined;
  const t = String(body.mediaType ?? "image");
  if (["image", "video", "audio", "file"].includes(t)) return t as CampaignMessage["mediaType"];
  return "image";
}
