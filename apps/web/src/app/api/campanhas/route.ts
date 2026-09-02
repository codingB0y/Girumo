import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/campaign-groups";
import * as linksStore from "@/lib/stores/tracked-links";
import { campanhasColl, ensureSlugs, uniqueCampanhaSlug, type Campanha } from "@/lib/campanhas-store";
import { listLinks, slugify } from "@/lib/store";
import { assertPlanLimit } from "@/lib/billing/entitlements";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import {
  mergeIntegracoes,
  parseEntradaPatch,
  parseIntegracoesPatch,
  readEntrada,
  readIntegracoes,
  withEntrada,
  withIntegracoes,
} from "@/lib/campaigns/settings";
import { apresentaIntegracoes } from "./apresenta";
import { listLandingPages } from "@/lib/pages/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O slug da campanha é também o slug do link mestre em `/r/:slug`, e
 * `tracked_links.slug` é único GLOBALMENTE (entre tenants) — então não basta
 * conferir as campanhas do próprio tenant: um slug já tomado por qualquer link
 * faria a criação do link mestre estourar.
 */
async function uniqueMasterSlug(name: string, takenInTenant: Set<string>): Promise<string> {
  const base = slugify(name) || "campanha";
  let slug = base;
  for (let attempt = 0; attempt < 25; attempt++) {
    if (!takenInTenant.has(slug) && !(await linksStore.getTrackedLinkBySlug(slug))) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  // Fallback praticamente impossível de colidir, p/ nunca travar a criação.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

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
    settings: {
      entrada: readEntrada(c.metadata as Record<string, unknown>),
      integracoes: apresentaIntegracoes(readIntegracoes(c.metadata as Record<string, unknown>)),
    },
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

  const existing = await supaStore.listCampaignGroups(tenantId);
  const slug = await uniqueMasterSlug(name, new Set(existing.map((c) => c.slug)));

  const rec = await supaStore.createCampaignGroup(tenantId, {
    name,
    slug,
    group_ids: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
    auto_grow: b.autoGrow === true,
    grow_template: b.growTemplate as Record<string, unknown> | undefined,
  });

  // Link mestre. /r/<slug> só resolve porque existe ESTA linha — campanha sem
  // ela nasce com link morto. Se a criação falhar (corrida de slug), desfaz a
  // campanha em vez de entregar uma com link quebrado.
  try {
    await linksStore.createTrackedLink(tenantId, {
      slug: rec.slug,
      target_url: "",
      campaign_group_id: rec.id,
      metadata: { campaignName: rec.name, master: true },
    });
  } catch {
    await supaStore.deleteCampaignGroup(tenantId, rec.id);
    return Response.json(
      { error: "Não foi possível gerar o link da campanha. Tente de novo." },
      { status: 409 },
    );
  }

  // Store loja in metadata
  if (b.loja) {
    await supaStore.updateCampaignGroup(tenantId, rec.id, {
      metadata: { loja: String(b.loja).trim() },
    });
  }

  // Marco de ativação: 1ª campanha (existing capturado antes do create).
  if (existing.length === 0) {
    void trackFunnelEvent({ tenantId, userId: ctx.authUserId, event: "first_campaign_created", onlyFirst: true, metadata: { campaignId: rec.id } });
  }

  return Response.json({
    id: rec.id,
    name: rec.name,
    loja: b.loja ?? "Minha loja",
    groupIds: rec.group_ids,
    slug: rec.slug,
    autoGrow: rec.auto_grow,
    settings: {
      entrada: readEntrada(rec.metadata as Record<string, unknown>),
      integracoes: apresentaIntegracoes(readIntegracoes(rec.metadata as Record<string, unknown>)),
    },
    createdAt: rec.created_at,
  }, { status: 201 });
}

// PATCH /api/campanhas
export async function PATCH(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:edit");
  // Declarado ANTES do branch legado: lá embaixo ele é lido, e com o `const`
  // depois do `if` a leitura caía na zona morta (ReferenceError, não `undefined`).
  const tenantId = ctx.tenantId;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    // Configurações de entrada (`settings`) só existem no ramo Supabase — o
    // JSON legado é emergência/dev antigo e as ignora.
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

  const patch: Partial<Pick<supaStore.CampaignGroup, "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata">> = {};
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (Array.isArray(b.groupIds)) patch.group_ids = b.groupIds.map(String);
  if (typeof b.autoGrow === "boolean") patch.auto_grow = b.autoGrow;
  if (b.growTemplate && typeof b.growTemplate === "object") {
    patch.grow_template = b.growTemplate as Record<string, unknown>;
  }

  if (b.settings !== undefined) {
    const s = (b.settings ?? {}) as Record<string, unknown>;
    const parsed = parseEntradaPatch(s.entrada);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    if (parsed.entrada.lotado.modo === "pagina") {
      // O slug vem do painel, mas quem manda é o banco: só página PUBLICADA
      // deste tenant pode ser destino — /p/<slug> de outra conta seria vazamento.
      const slug = parsed.entrada.lotado.pagina_slug;
      const pages = await listLandingPages(tenantId);
      if (!pages.some((p) => p.slug === slug && p.status === "published")) {
        return Response.json({ error: "Página não encontrada ou não publicada." }, { status: 400 });
      }
    }
    // `metadata` é substituído inteiro pelo update: lê o atual para não perder
    // `loja` e o que mais estiver lá.
    const current = await supaStore.getCampaignGroupById(tenantId, id);
    if (!current) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    let metadata = withEntrada(current.metadata as Record<string, unknown>, parsed.entrada);

    if (s.integracoes !== undefined) {
      const pi = parseIntegracoesPatch(s.integracoes);
      if (!pi.ok) return Response.json({ error: pi.error }, { status: 400 });
      // O painel nunca recebeu o token, então não pode reenviá-lo: o merge é
      // quem decide entre manter o que está no banco e apagar de propósito.
      const atual = readIntegracoes(current.metadata as Record<string, unknown>);
      metadata = withIntegracoes(metadata, mergeIntegracoes(atual, pi.patch));
    }
    patch.metadata = metadata;
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
    settings: {
      entrada: readEntrada(updated.metadata as Record<string, unknown>),
      integracoes: apresentaIntegracoes(readIntegracoes(updated.metadata as Record<string, unknown>)),
    },
    createdAt: updated.created_at,
  });
}

// DELETE /api/campanhas?id=
export async function DELETE(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:delete");
  // Ver comentário no PATCH: `const` depois do branch legado dava TDZ.
  const tenantId = ctx.tenantId;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const owned = (await campanhasColl.list()).some((item) => item.id === id && item.tenantId === tenantId);
    if (!owned) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    await campanhasColl.remove(id);
    return Response.json({ ok: true });
  }

  await supaStore.deleteCampaignGroup(tenantId, id);
  return Response.json({ ok: true });
}
