import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/broadcasts";
import { collection } from "@/lib/json-collection";
import { crudRoute } from "@/lib/crud-route";
import type { Campaign, CampaignStatus } from "@/lib/mock-data";
import { resolveSessionTenantId } from "@/lib/session-tenant";
import { assertPlanLimit } from "@/lib/billing/entitlements";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy
const coll = collection<Campaign>("broadcasts.json");

function parsePoll(raw: unknown): { question: string; options: string[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as { question?: unknown; options?: unknown };
  const question = String(p.question ?? "").trim();
  const options = Array.isArray(p.options) ? p.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 12) : [];
  if (!question || options.length < 2) return undefined;
  return { question, options };
}

const legacy = crudRoute<Campaign>(coll, (b) => {
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
    total: groupIds.length,
    createdAt: new Date().toISOString(),
  };
});

export async function GET(req: Request) {
  if (!USE_SUPABASE) return legacy.GET();
  const tenantId = await resolveSessionTenantId(req);
  if (!tenantId) return Response.json([]);
  const list = await supaStore.listBroadcasts(tenantId);
  // Map to legacy frontend shape
  const mapped = list.map((b) => ({
    id: b.id,
    name: b.name,
    message: b.message,
    groupIds: b.group_ids,
    mediaId: b.media_id,
    mediaType: b.media_type,
    mentionAll: b.mention_all,
    poll: b.poll,
    status: b.status,
    sent: b.sent,
    total: b.total,
    error: b.error,
    createdAt: b.created_at,
    dispatchedAt: b.dispatched_at,
    runningSince: b.running_since,
    lastAckAt: b.last_ack_at,
  }));
  return Response.json(mapped);
}

export async function POST(req: Request) {
  if (!USE_SUPABASE) return legacy.POST(req);

  const tenantId = await resolveSessionTenantId(req);
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  // M4: rate-limit por tenant na camada HTTP (defesa em profundidade além do
  // limite de plano). Barra polling agressivo deste endpoint de criação/envio.
  if (await checkRateLimit(`broadcast:${tenantId}`, 20, 60_000)) {
    return Response.json({ error: "Muitas requisições. Aguarde um momento." }, { status: 429 });
  }

  try {
    await assertPlanLimit(tenantId, "campaigns:send");
    // Teto de contatos cobrado no ALCANCE, e nao na entrada. Quem cria lead e o
    // engine, quando alguem entra num grupo; barrar la descartaria o registro de
    // quem ja entrou — a pessoa entra de qualquer jeito, o WhatsApp nao consulta
    // plano. Aqui a acao e do lojista e a saida (mudar de plano) resolve.
    await assertPlanLimit(tenantId, "contacts:reach");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!b.name || (!b.message && !b.mediaId && !parsePoll(b.poll))) {
    return Response.json({ error: "Informe um nome e uma mensagem, foto ou enquete." }, { status: 400 });
  }

  const groupIds = Array.isArray(b.groupIds) ? b.groupIds.map(String) : [];
  const rec = await supaStore.createBroadcast(tenantId, {
    name: String(b.name),
    message: String(b.message ?? ""),
    group_ids: groupIds,
    media_id: b.mediaId ? String(b.mediaId) : undefined,
    media_type: b.mediaId ? (b.mediaType === "video" ? "video" : "image") : undefined,
    mention_all: b.mentionAll === true,
    poll: parsePoll(b.poll),
  });

  return Response.json({
    id: rec.id,
    name: rec.name,
    message: rec.message,
    groupIds: rec.group_ids,
    mediaId: rec.media_id,
    mediaType: rec.media_type,
    mentionAll: rec.mention_all,
    poll: rec.poll,
    status: rec.status,
    sent: rec.sent,
    total: rec.total,
    createdAt: rec.created_at,
  }, { status: 201 });
}

export async function DELETE(req: Request) {
  if (!USE_SUPABASE) return legacy.DELETE(req);

  const tenantId = await resolveSessionTenantId(req);
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await supaStore.deleteBroadcast(tenantId, id);
  return Response.json({ ok: true });
}
