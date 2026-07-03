import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/groups";
import { listGroups as legacyList, replaceGroups as legacyReplace, updateGroup as legacyUpdate, type SyncGroupInput } from "@/lib/groups-store";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

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
    inviteUrl: g.invite_url,
    displayNameBase: g.display_name_base,
    displayNumber: g.display_number,
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

  const rows = groups.map((g) => ({
    whatsapp_group_id: g.whatsappGroupId,
    name: g.name,
    members: g.members,
    capacity: g.capacity ?? 1024,
    selected: false,
    engagement: "medio" as const,
    invite_url: g.inviteUrl,
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

  if (!USE_SUPABASE) {
    const patch: { inviteUrl?: string; capacity?: number; displayNameBase?: string; displayNumber?: number } = {};
    if (typeof b.inviteUrl === "string") patch.inviteUrl = b.inviteUrl.trim();
    if (b.capacity !== undefined && Number(b.capacity) > 0) patch.capacity = Number(b.capacity);
    if (typeof b.displayNameBase === "string") patch.displayNameBase = b.displayNameBase.trim();
    if (b.displayNumber !== undefined) patch.displayNumber = Number(b.displayNumber) > 0 ? Number(b.displayNumber) : 0;
    const updated = await legacyUpdate(tenantId, id, patch);
    if (!updated) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    return Response.json(updated);
  }

  const patch: Record<string, unknown> = {};
  if (typeof b.inviteUrl === "string") patch.invite_url = b.inviteUrl.trim();
  if (b.capacity !== undefined && Number(b.capacity) > 0) patch.capacity = Number(b.capacity);
  if (typeof b.displayNameBase === "string") patch.display_name_base = b.displayNameBase.trim();
  if (b.displayNumber !== undefined) patch.display_number = Number(b.displayNumber) > 0 ? Number(b.displayNumber) : 0;

  // Find the group by whatsapp_group_id
  const { data: group } = await getSupabaseAdmin()
    .from("groups")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", id)
    .maybeSingle();
  if (!group) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });

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
    inviteUrl: updated.invite_url,
    displayNameBase: updated.display_name_base,
    displayNumber: updated.display_number,
  });
}
