import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/tracked-links";
import { listLinks, createLink, clickCounts, slugify } from "@/lib/store";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// GET /api/links
export async function GET() {
  if (!USE_SUPABASE) {
    const [links, counts] = await Promise.all([listLinks(), clickCounts()]);
    const data = links
      .map((l) => ({ ...l, clicks: counts[l.slug] ?? 0 }))
      .sort((a, b) => b.clicks - a.clicks);
    return Response.json(data);
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json([]);
  const links = await supaStore.listTrackedLinks(tenantId);
  const mapped = links
    .map((l) => ({
      id: l.id,
      slug: l.slug,
      destinationUrl: l.target_url,
      campaignName: (l.metadata as Record<string, unknown>)?.campaignName ?? "",
      targetGroupName: (l.metadata as Record<string, unknown>)?.targetGroupName ?? "",
      clicks: l.clicks,
      createdAt: l.created_at,
    }))
    .sort((a, b) => b.clicks - a.clicks);
  return Response.json(mapped);
}

// POST /api/links
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const destinationUrl = String(body.destinationUrl ?? "").trim();
  const rawSlug = String(body.slug ?? "").trim();
  const targetGroupName = String(body.targetGroupName ?? "").trim();
  const campaignName = String(body.campaignName ?? "").trim();
  const pixelId = String(body.pixelId ?? "").replace(/\D/g, "");
  const capRaw = Number(body.clickCap);
  const clickCap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : undefined;

  if (!destinationUrl || !/^https?:\/\//i.test(destinationUrl)) {
    return Response.json(
      { error: "Informe um link de destino válido (https://...)." },
      { status: 400 },
    );
  }

  const slug = slugify(rawSlug || campaignName || targetGroupName || "link");
  if (!slug) {
    return Response.json({ error: "Não foi possível gerar o slug." }, { status: 400 });
  }

  if (!USE_SUPABASE) {
    try {
      const link = await createLink({ slug, destinationUrl, targetGroupName, campaignName, pixelId: pixelId || undefined, clickCap });
      return Response.json(link, { status: 201 });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 409 });
    }
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  // Check if slug already exists
  const existing = await supaStore.getTrackedLinkBySlug(slug);
  if (existing) {
    return Response.json({ error: `Slug "${slug}" já está em uso.` }, { status: 409 });
  }

  const link = await supaStore.createTrackedLink(tenantId, {
    slug,
    target_url: destinationUrl,
  });

  // Store extra metadata
  if (campaignName || targetGroupName || pixelId || clickCap) {
    await getSupabaseAdmin()
      .from("tracked_links")
      .update({ metadata: { campaignName, targetGroupName, pixelId, clickCap } })
      .eq("id", link.id);
  }

  return Response.json({
    id: link.id,
    slug: link.slug,
    destinationUrl: link.target_url,
    campaignName,
    targetGroupName,
    clicks: 0,
    createdAt: link.created_at,
  }, { status: 201 });
}
