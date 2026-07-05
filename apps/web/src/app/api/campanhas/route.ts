import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/campaign-groups";
import { campanhasColl, ensureSlugs, uniqueCampanhaSlug, type Campanha } from "@/lib/campanhas-store";
import { listLinks, slugify } from "@/lib/store";
import { assertPlanLimit } from "@/lib/billing/entitlements";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/campanhas
export async function GET(req: Request) {
  const { tenantId } = await getTenantContext(req);
  if (!USE_SUPABASE) {
    await ensureSlugs();
    return Response.json((await campanhasColl.list()).filter((item) => item.tenantId === tenantId));
  }
  const list = await supaStore.listCampaignGroups(tenantId);
  // Map to legacy frontend shape
  const mapped = list.map((c) => ({
    id: c.id,
    name: c.name,
    loja: (c.metadata as Record<string, unknown>)?.loja ?? "Minha loja",
    groupIds: c.group_ids,
    slug: c.slug,
    autoGrow: c.auto_grow,
    growTemplate: c.grow_template,
    createdAt: c.created_at,
  }));
  return Response.json(mapped);
}

// POST /api/campanhas
export async function POST(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:create");
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  if (!name) return Response.json({ error: "Dê um nome à campanha." }, { status: 400 });
  const tenantId = ctx.tenantId;

  if (!USE_SUPABASE) {
    const [links, campanhas] = await Promise.all([listLinks(), campanhasColl.list()]);
    const taken = new Set<string>([...links.map((l) => l.slug), ...campanhas.map((c) => c.slug).filter(Boolean) as string[]]);
    const rec = await campanhasColl.create({
      tenantId,
      name,
      loja: String(b.loja ?? "Minha loja").trim() || "Minha loja",
      groupIds: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
      slug: uniqueCampanhaSlug(name, taken),
      createdAt: new Date().toISOString(),
    } as Omit<Campanha, "id">);
    return Response.json(rec, { status: 201 });
  }

  try {
    await assertPlanLimit(tenantId, "campaigns:create");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  // Generate unique slug
  const existing = await supaStore.listCampaignGroups(tenantId);
  const taken = new Set(existing.map((c) => c.slug));
  const base = slugify(name) || "campanha";
  let slug = base;
  while (taken.has(slug)) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const rec = await supaStore.createCampaignGroup(tenantId, {
    name,
    slug,
    group_ids: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
    auto_grow: b.autoGrow === true,
    grow_template: b.growTemplate as Record<string, unknown> | undefined,
  });

  // Store loja in metadata
  if (b.loja) {
    await supaStore.updateCampaignGroup(tenantId, rec.id, {
      metadata: { loja: String(b.loja).trim() },
    });
  }

  return Response.json({
    id: rec.id,
    name: rec.name,
    loja: b.loja ?? "Minha loja",
    groupIds: rec.group_ids,
    slug: rec.slug,
    autoGrow: rec.auto_grow,
    createdAt: rec.created_at,
  }, { status: 201 });
}

// PATCH /api/campanhas
export async function PATCH(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:edit");
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const owned = (await campanhasColl.list()).some((item) => item.id === id && item.tenantId === tenantId);
    if (!owned) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const patch: Partial<Campanha> = {};
    if (typeof b.name === "string") patch.name = b.name.trim();
    if (typeof b.loja === "string") patch.loja = b.loja.trim();
    if (Array.isArray(b.groupIds)) patch.groupIds = b.groupIds.map(String);
    if (typeof b.autoGrow === "boolean") patch.autoGrow = b.autoGrow;
    if (b.growTemplate && typeof b.growTemplate === "object") {
      const g = b.growTemplate as Record<string, unknown>;
      const subjectPattern = String(g.subjectPattern ?? "").trim();
      if (subjectPattern) {
        patch.growTemplate = {
          subjectPattern,
          desc: g.desc ? String(g.desc) : undefined,
          mediaId: g.mediaId ? String(g.mediaId) : undefined,
          announce: g.announce !== false,
          memberAddMode: g.memberAddMode === "all_member_add" ? "all_member_add" : "admin_add",
        };
      }
    }
    const updated = await campanhasColl.update(id, patch);
    if (!updated) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    return Response.json(updated);
  }

  const tenantId = ctx.tenantId;

  const patch: Partial<Pick<supaStore.CampaignGroup, "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata">> = {};
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (Array.isArray(b.groupIds)) patch.group_ids = b.groupIds.map(String);
  if (typeof b.autoGrow === "boolean") patch.auto_grow = b.autoGrow;
  if (b.growTemplate && typeof b.growTemplate === "object") {
    patch.grow_template = b.growTemplate as Record<string, unknown>;
  }

  const updated = await supaStore.updateCampaignGroup(tenantId, id, patch);
  if (!updated) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  return Response.json({
    id: updated.id,
    name: updated.name,
    loja: (updated.metadata as Record<string, unknown>)?.loja ?? "Minha loja",
    groupIds: updated.group_ids,
    slug: updated.slug,
    autoGrow: updated.auto_grow,
    growTemplate: updated.grow_template,
    createdAt: updated.created_at,
  });
}

// DELETE /api/campanhas?id=
export async function DELETE(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:delete");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const owned = (await campanhasColl.list()).some((item) => item.id === id && item.tenantId === tenantId);
    if (!owned) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    await campanhasColl.remove(id);
    return Response.json({ ok: true });
  }

  const tenantId = ctx.tenantId;
  await supaStore.deleteCampaignGroup(tenantId, id);
  return Response.json({ ok: true });
}
