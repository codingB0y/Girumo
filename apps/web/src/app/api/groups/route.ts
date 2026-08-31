import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/groups";
import { listGroups as legacyList, replaceGroups as legacyReplace, updateGroup as legacyUpdate, type SyncGroupInput } from "@/lib/groups-store";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { normalizeInviteUrl } from "@/lib/groups/invite-url";
import { clearInviteFetchMarker } from "@/lib/groups/invite-backfill";
import { DEFAULT_GROUP_CAPACITY } from "@/lib/links/resolve-click-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/groups
export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  if (!USE_SUPABASE) {
    return Response.json(await legacyList(tenantId));
  }
  const groups = await supaStore.listGroups(tenantId);
  // Map to legacy shape for frontend compatibility
  const mapped = groups.map((g) => ({
    id: g.whatsapp_group_id,
    name: g.name,
    whatsappGroupId: g.whatsapp_group_id,
    members: g.members,
    capacity: g.capacity,
    selected: g.selected,
    engagement: g.engagement,
    isAdmin: g.is_admin ?? false,
    inviteUrl: g.invite_url,
    displayNameBase: g.display_name_base,
    displayNumber: g.display_number,
    sendState: g.send_state ?? null,
  }));
  return Response.json(mapped);
}

// POST /api/groups — sync da engine
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  let body: { groups?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = Array.isArray(body.groups) ? body.groups : [];
  const groups: SyncGroupInput[] = raw
    .map((g) => g as Record<string, unknown>)
    .filter((g) => g.whatsappGroupId && g.name)
    .map((g) => ({
      whatsappGroupId: String(g.whatsappGroupId),
      name: String(g.name),
      members: Number(g.members) || 0,
      inviteUrl: typeof g.inviteUrl === "string" && g.inviteUrl ? g.inviteUrl : undefined,
      capacity: Number(g.capacity) > 0 ? Number(g.capacity) : undefined,
    }));

  if (!USE_SUPABASE) {
    const saved = await legacyReplace(tenantId, groups);
    return Response.json({ count: saved.length }, { status: 201 });
  }

  // Mesma regra do `syncGroupsFromProvider`: grava só o que o WhatsApp é dono.
  // `selected`, `engagement` e `capacity` são do painel — mandá-los fixos aqui
  // fazia todo sync da engine devolver a capacidade pra 1024 e apagar a seleção
  // do lojista. Em linha nova, o default da tabela cobre os três.
  const rows = groups.map((g) => ({
    whatsapp_group_id: g.whatsappGroupId,
    name: g.name,
    members: g.members,
    ...(g.capacity !== undefined ? { capacity: g.capacity } : {}),
    ...(g.inviteUrl ? { invite_url: g.inviteUrl } : {}),
  }));
  const saved = await supaStore.upsertGroupsBatch(tenantId, rows);
  return Response.json({ count: saved.length }, { status: 201 });
}

// PATCH /api/groups
export async function PATCH(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  // Convite e capacidade são validados AQUI, não só no formulário: este campo é
  // o destino do `/r/<slug>`, e um valor errado não quebra o painel — quebra do
  // outro lado, quando o cliente da loja clica no link já divulgado.
  // `undefined` = não mexe no campo; `null` = limpa.
  let inviteUrl: string | null | undefined;
  if (typeof b.inviteUrl === "string") {
    const raw = b.inviteUrl.trim();
    if (!raw) {
      inviteUrl = null;
    } else {
      inviteUrl = normalizeInviteUrl(raw);
      if (!inviteUrl) {
        return Response.json(
          { error: "Convite inválido. Cole o link do grupo (chat.whatsapp.com/…)." },
          { status: 400 },
        );
      }
    }
  }

  // Acima do teto do WhatsApp o grupo nunca chegaria a "cheio" e a rotação do
  // link mestre jamais passaria pro próximo grupo.
  let capacity: number | undefined;
  if (b.capacity !== undefined) {
    const n = Number(b.capacity);
    if (!Number.isInteger(n) || n < 1 || n > DEFAULT_GROUP_CAPACITY) {
      return Response.json(
        { error: `Capacidade deve ser um número inteiro entre 1 e ${DEFAULT_GROUP_CAPACITY}.` },
        { status: 400 },
      );
    }
    capacity = n;
  }

  if (!USE_SUPABASE) {
    const patch: { inviteUrl?: string; capacity?: number; displayNameBase?: string; displayNumber?: number } = {};
    if (inviteUrl !== undefined) patch.inviteUrl = inviteUrl ?? "";
    if (capacity !== undefined) patch.capacity = capacity;
    if (typeof b.displayNameBase === "string") patch.displayNameBase = b.displayNameBase.trim();
    if (b.displayNumber !== undefined) patch.displayNumber = Number(b.displayNumber) > 0 ? Number(b.displayNumber) : 0;
    const updated = await legacyUpdate(tenantId, id, patch);
    if (!updated) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    return Response.json(updated);
  }

  const patch: Record<string, unknown> = {};
  if (inviteUrl !== undefined) patch.invite_url = inviteUrl;
  if (capacity !== undefined) patch.capacity = capacity;
  if (typeof b.displayNameBase === "string") patch.display_name_base = b.displayNameBase.trim();
  if (b.displayNumber !== undefined) patch.display_number = Number(b.displayNumber) > 0 ? Number(b.displayNumber) : 0;

  // Find the group by whatsapp_group_id
  const { data: group } = await getSupabaseAdmin()
    .from("groups")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", id)
    .maybeSingle();
  if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });

  // Resgate manual de um grupo marcado como sem-convite pelo cron. Nunca é
  // automático: a Evolution achata toda falha num 404, então só uma pessoa
  // olhando sabe se vale tentar de novo.
  if (b.clearInviteFetchError === true) {
    patch.metadata = clearInviteFetchMarker(group.metadata as Record<string, unknown> | null);
  }

  const updated = await supaStore.updateGroup(tenantId, group.id, patch as Partial<supaStore.Group>);
  if (!updated) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
  return Response.json({
    id: updated.whatsapp_group_id,
    name: updated.name,
    whatsappGroupId: updated.whatsapp_group_id,
    members: updated.members,
    capacity: updated.capacity,
    selected: updated.selected,
    engagement: updated.engagement,
    isAdmin: updated.is_admin ?? false,
    inviteUrl: updated.invite_url,
    displayNameBase: updated.display_name_base,
    displayNumber: updated.display_number,
  });
}
