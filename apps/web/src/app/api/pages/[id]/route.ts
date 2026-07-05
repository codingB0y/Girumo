import { revalidateTag } from "next/cache";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import {
  getLandingPageById,
  getLpMetrics,
  listRecentLpLeads,
  updateLandingPage,
  type LpUpdatePatch,
} from "@/lib/pages/store";
import {
  toContent,
  validateContent,
  validateTargetGroupUrl,
  type LpStatus,
} from "@/lib/pages/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: LpStatus[] = ["draft", "published", "paused"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "id inválido." }, { status: 400 });

  try {
    const ctx = await getTenantContext(req);
    const page = await getLandingPageById(ctx.tenantId, id);
    if (!page) return Response.json({ error: "Página não encontrada." }, { status: 404 });

    const [metrics, leads] = await Promise.all([
      getLpMetrics(ctx.tenantId, id),
      listRecentLpLeads(ctx.tenantId, id, 20),
    ]);
    return Response.json({ page, metrics, leads });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "id inválido." }, { status: 400 });

  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    const existing = await getLandingPageById(ctx.tenantId, id);
    if (!existing) return Response.json({ error: "Página não encontrada." }, { status: 404 });

    const patch: LpUpdatePatch = {};

    if (body.content !== undefined) {
      const errors = validateContent(body.content);
      if (errors.length > 0) {
        return Response.json({ error: "Conteúdo inválido.", details: errors }, { status: 400 });
      }
      patch.content = toContent(body.content as Record<string, unknown>);
    }

    if (body.target_group_url !== undefined) {
      const url = typeof body.target_group_url === "string" ? body.target_group_url.trim() : "";
      if (url && !validateTargetGroupUrl(url)) {
        return Response.json(
          { error: "target_group_url precisa ser um link https de chat.whatsapp.com ou wa.me." },
          { status: 400 },
        );
      }
      patch.target_group_url = url || null;
    }

    if (body.campaign_slug !== undefined) {
      const slug = typeof body.campaign_slug === "string" ? body.campaign_slug.trim() : "";
      patch.campaign_slug = slug || null;
    }

    if (body.meta_pixel_id !== undefined) {
      patch.meta_pixel_id =
        typeof body.meta_pixel_id === "string" && body.meta_pixel_id.trim()
          ? body.meta_pixel_id.trim().slice(0, 40)
          : null;
    }

    if (body.ga4_id !== undefined) {
      patch.ga4_id =
        typeof body.ga4_id === "string" && body.ga4_id.trim()
          ? body.ga4_id.trim().slice(0, 40)
          : null;
    }

    if (body.status !== undefined) {
      const status = body.status as LpStatus;
      if (!STATUSES.includes(status)) {
        return Response.json({ error: "status inválido." }, { status: 400 });
      }
      if (status === "published") {
        const hasDestination =
          (patch.campaign_slug ?? existing.campaign_slug) ||
          (patch.target_group_url ?? existing.target_group_url);
        if (!hasDestination) {
          return Response.json(
            { error: "Defina o link do grupo ou uma campanha antes de publicar." },
            { status: 400 },
          );
        }
        if (!existing.published_at) patch.published_at = new Date().toISOString();
      }
      patch.status = status;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nada pra atualizar." }, { status: 400 });
    }

    const updated = await updateLandingPage(ctx.tenantId, id, patch);
    if (!updated) return Response.json({ error: "Página não encontrada." }, { status: 404 });

    // Cache público reflete publish/pause/edição em segundos
    revalidateTag(`lp:${updated.slug}`);

    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
