import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/campaign-messages";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { collection } from "@/lib/json-collection";
import { createMessage, listByCampaign, removeMessage } from "@/lib/messages-store";
import type { CampaignMessage } from "@/lib/messages-store";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
const campanhas = collection<Campanha>("campanhas.json");

async function resolveTenantId(): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

async function resolveCampaignLegacy(slug: string): Promise<Campanha | null> {
  const list = await campanhas.list();
  return list.find((c) => c.slug === slug || c.id === slug) ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!USE_SUPABASE) {
    const camp = await resolveCampaignLegacy(slug);
    if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const messages = await listByCampaign(camp.id);
    return Response.json(messages);
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const messages = await supaStore.listByCampaignGroup(tenantId, camp.id);
  // Map to frontend shape
  const mapped = messages.map(mapToFrontend);
  return Response.json(mapped);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const messageBody = String(body.body ?? "").trim();
  const poll = parsePoll(body.poll);

  if (!messageBody && !body.mediaId && !poll) {
    return Response.json({ error: "Informe uma mensagem, mídia ou enquete." }, { status: 400 });
  }

  if (!USE_SUPABASE) {
    const camp = await resolveCampaignLegacy(slug);
    if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

    const groupIds = Array.isArray(body.groupIds) && body.groupIds.length > 0
      ? body.groupIds.map(String)
      : camp.groupIds;

    const type = resolveType(body) as CampaignMessage["type"];
    const msg = await createMessage({
      campaignId: camp.id,
      campaignSlug: camp.slug ?? camp.id,
      type,
      body: messageBody,
      groupIds,
      mediaId: body.mediaId ? String(body.mediaId) : undefined,
      mediaType: resolveMediaType(body) as CampaignMessage["mediaType"],
      mediaName: body.mediaName ? String(body.mediaName) : undefined,
      poll,
      mentionAll: body.mentionAll === true,
      scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
      recurrence: (["none", "daily", "weekly"].includes(String(body.recurrence ?? "")) ? String(body.recurrence) : "none") as CampaignMessage["recurrence"],
    });
    return Response.json(msg, { status: 201 });
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const groupIds = Array.isArray(body.groupIds) && body.groupIds.length > 0
    ? body.groupIds.map(String)
    : camp.group_ids;

  const type = resolveType(body);
  const msg = await supaStore.createCampaignMessage(tenantId, {
    campaign_group_id: camp.id,
    campaign_slug: camp.slug,
    type: type as supaStore.CampaignMessageType,
    body: messageBody,
    group_ids: groupIds,
    media_id: body.mediaId ? String(body.mediaId) : undefined,
    media_type: resolveMediaType(body) ?? undefined,
    media_name: body.mediaName ? String(body.mediaName) : undefined,
    poll,
    mention_all: body.mentionAll === true,
    scheduled_at: body.scheduledAt ? String(body.scheduledAt) : undefined,
    recurrence: (["none", "daily", "weekly"].includes(String(body.recurrence ?? "")) ? String(body.recurrence) : "none") as supaStore.ScheduleRecurrence,
  });

  // If not scheduled, enqueue for dispatch
  if (!body.scheduledAt) {
    await supaStore.enqueueCampaignMessage(tenantId, msg.id);
  }

  return Response.json(mapToFrontend(msg), { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const ok = await removeMessage(id);
    if (!ok) return Response.json({ error: "Mensagem não encontrada ou em andamento." }, { status: 404 });
    return Response.json({ ok: true });
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const ok = await supaStore.deleteCampaignMessage(tenantId, id);
  if (!ok) return Response.json({ error: "Mensagem não encontrada ou em andamento." }, { status: 404 });
  return Response.json({ ok: true });
}

// --- helpers ---

function mapToFrontend(m: supaStore.CampaignMessage) {
  return {
    id: m.id,
    campaignId: m.campaign_group_id,
    campaignSlug: m.campaign_slug,
    type: m.type,
    body: m.body,
    groupIds: m.group_ids,
    mediaId: m.media_id,
    mediaType: m.media_type,
    mediaName: m.media_name,
    poll: m.poll,
    mentionAll: m.mention_all,
    scheduledAt: m.scheduled_at,
    recurrence: m.recurrence,
    status: m.status,
    sent: m.sent,
    total: m.total,
    error: m.error,
    createdAt: m.created_at,
    dispatchedAt: m.dispatched_at,
    runningSince: m.running_since,
    lastAckAt: m.last_ack_at,
  };
}

function parsePoll(raw: unknown): { question: string; options: string[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as { question?: unknown; options?: unknown };
  const question = String(p.question ?? "").trim();
  const options = Array.isArray(p.options) ? p.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 12) : [];
  if (!question || options.length < 2) return undefined;
  return { question, options };
}

function resolveType(body: Record<string, unknown>): string {
  if (body.poll) return "poll";
  if (body.mediaType === "audio") return "audio";
  if (body.mediaType === "file") return "file";
  if (body.mediaType === "video") return "video";
  if (body.mediaType === "image") return "image";
  if (body.mediaId) return "image";
  return "text";
}

function resolveMediaType(body: Record<string, unknown>): string | undefined {
  if (!body.mediaId) return undefined;
  const t = String(body.mediaType ?? "image");
  if (["image", "video", "audio", "file"].includes(t)) return t;
  return "image";
}
