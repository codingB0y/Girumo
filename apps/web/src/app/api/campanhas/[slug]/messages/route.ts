import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as broadcastsStore from "@/lib/stores/broadcasts";
import * as schedulesStore from "@/lib/stores/schedules";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import { collection } from "@/lib/json-collection";
import { createMessage, listByCampaign, removeMessage } from "@/lib/messages-store";
import type { CampaignMessage } from "@/lib/messages-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { assertPermission, type TenantRole } from "@/lib/permissions";
import { assertPlanLimit } from "@/lib/billing/entitlements";
import { getSession, isLive } from "@/lib/session-store";
import { buildDispatchList, toDispatchView } from "@/lib/campaigns/dispatch-view";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { getSessionAccountId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
const campanhas = collection<Campanha>("campanhas.json");

async function resolveCampaignLegacy(slug: string): Promise<Campanha | null> {
  const list = await campanhas.list();
  return list.find((c) => c.slug === slug || c.id === slug) ?? null;
}

/**
 * `role` é nulo quando quem chama é a engine. Estas rotas são de painel
 * (`allowEngine: false`), então sem papel não há o que autorizar.
 */
function assertCampaignOperator(role: TenantRole | null): asserts role is TenantRole {
  if (!role) throw new Response("Sem permissão para esta ação.", { status: 403 });
  assertPermission(role, "campaign:edit");
}

// GET /api/campanhas/[slug]/messages — ofertas da campanha + agendamentos.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!USE_SUPABASE) {
    const camp = await resolveCampaignLegacy(slug);
    if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    return Response.json(await listByCampaign(camp.id));
  }

  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const broadcasts = await broadcastsStore.listBroadcastsByCampaign(tenantId, camp.id);
  const schedules = await schedulesStore.listSchedulesByBroadcastIds(
    tenantId,
    broadcasts.map((b) => b.id),
  );
  return Response.json(buildDispatchList(broadcasts, schedules, camp.slug));
}

/**
 * POST — "Enviar agora" / "Agendar".
 *
 * Antes gravava `campaign_messages` com status 'queued' e nada consumia essa
 * tabela: o lojista via sucesso e nenhuma mensagem saía. Agora cria um
 * `broadcasts` e usa o pipeline real — fan-out (`enqueue_broadcast`) → worker →
 * Evolution. Agendamento vira linha em `schedules` com `broadcast_id`, que o
 * `promote_due_schedules` do worker promove na hora certa.
 *
 * O ritmo/caps do envio são decididos NO BANCO (`claim_send_commands`); aqui não
 * se decide nada disso. E o destino é sempre grupo — nunca DM.
 */
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

    const msg = await createMessage({
      campaignId: camp.id,
      campaignSlug: camp.slug ?? camp.id,
      type: resolveType(body) as CampaignMessage["type"],
      body: messageBody,
      groupIds,
      mediaId: body.mediaId ? String(body.mediaId) : undefined,
      mediaType: resolveMediaType(body) as CampaignMessage["mediaType"],
      mediaName: body.mediaName ? String(body.mediaName) : undefined,
      poll,
      mentionAll: body.mentionAll === true,
      scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
      recurrence: resolveRecurrence(body) as CampaignMessage["recurrence"],
    });
    return Response.json(msg, { status: 201 });
  }

  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  // Disparar é operar a campanha: mesma permissão de editar.
  assertCampaignOperator(ctx.role);
  const tenantId = ctx.tenantId;

  const camp = await supaCampaigns.getCampaignGroupBySlug(tenantId, slug);
  if (!camp) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });

  const groupIds = Array.isArray(body.groupIds) && body.groupIds.length > 0
    ? body.groupIds.map(String)
    : camp.group_ids;

  if (groupIds.length === 0) {
    return Response.json(
      { error: "Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar." },
      { status: 400 },
    );
  }

  try {
    await assertPlanLimit(tenantId, "campaigns:send");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  // Sem WhatsApp conectado não existe disparo — melhor barrar aqui do que
  // enfileirar e o lojista descobrir depois que nada saiu.
  const session = await getSession(tenantId);
  if (!isLive(session)) {
    return Response.json(
      { error: "WhatsApp desconectado. Reconecte em Conexão antes de disparar." },
      { status: 409 },
    );
  }

  // Quem disparou, pros marcos de ativação. `getRouteTenantContext` resolve o
  // tenant, não o usuário — e marcar como null diria "foi a engine", que é falso.
  const authUserId = await getSessionAccountId();

  const scheduledAt = parseScheduledAt(body.scheduledAt);
  if (body.scheduledAt && !scheduledAt) {
    return Response.json({ error: "Data de agendamento inválida." }, { status: 400 });
  }

  const broadcast = await broadcastsStore.createBroadcast(tenantId, {
    campaign_group_id: camp.id,
    name: camp.name,
    message: messageBody,
    group_ids: groupIds,
    media_id: body.mediaId ? String(body.mediaId) : undefined,
    media_type: resolveMediaType(body),
    media_name: body.mediaName ? String(body.mediaName) : undefined,
    mention_all: body.mentionAll === true,
    poll,
  });

  // Agendado: fica `draft` e quem promove é o worker no horário. Enfileirar aqui
  // dispararia agora — exatamente o bug que este PR corrige.
  if (scheduledAt) {
    const schedule = await schedulesStore.createSchedule(tenantId, {
      broadcast_id: broadcast.id,
      name: camp.name,
      scheduled_at: scheduledAt,
      recurrence: resolveRecurrence(body) as schedulesStore.ScheduleRecurrence,
    });
    // Mesmo buraco do first_dispatch: `first_schedule` só era emitido por
    // /api/schedules, e agendar pela aba não passa por lá.
    void trackFunnelEvent({
      tenantId,
      userId: authUserId,
      event: "first_schedule",
      onlyFirst: true,
      metadata: { broadcastId: broadcast.id, scheduleId: schedule.id },
    });
    return Response.json(toDispatchView(broadcast, camp.slug, schedule), { status: 201 });
  }

  const enqueued = await broadcastsStore.enqueueBroadcast(tenantId, broadcast.id);

  // Marco de ativação. O evento existia, mas só era emitido por /api/dispatch —
  // a rota do motor legado. Migrado o envio pra cá, ele deixou de acontecer e o
  // funil marcava zero disparo mesmo com o lojista disparando.
  void trackFunnelEvent({
    tenantId,
    userId: authUserId,
    event: "first_dispatch",
    onlyFirst: true,
    metadata: { broadcastId: broadcast.id, campaignId: camp.id },
  });

  return Response.json(toDispatchView(enqueued ?? broadcast, camp.slug, null), { status: 201 });
}

// DELETE /api/campanhas/[slug]/messages?id= — remove uma oferta.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const ok = await removeMessage(id);
    if (!ok) return Response.json({ error: "Mensagem não encontrada ou em andamento." }, { status: 404 });
    return Response.json({ ok: true });
  }

  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  assertCampaignOperator(ctx.role);

  const broadcast = await broadcastsStore.getBroadcast(ctx.tenantId, id);
  if (!broadcast) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
  if (broadcast.status === "queued" || broadcast.status === "running") {
    return Response.json(
      { error: "Esta oferta está em andamento. Cancele antes de excluir." },
      { status: 409 },
    );
  }

  await broadcastsStore.deleteBroadcast(ctx.tenantId, id);
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

/** Agendamento só vale se for data real; passado vira erro em vez de sumir. */
function parseScheduledAt(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const ts = new Date(String(raw));
  return Number.isNaN(ts.getTime()) ? undefined : ts.toISOString();
}

function resolveRecurrence(body: Record<string, unknown>): string {
  const raw = String(body.recurrence ?? "");
  return ["none", "daily", "weekly"].includes(raw) ? raw : "none";
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
