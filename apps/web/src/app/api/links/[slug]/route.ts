import { getClickAnalytics } from "@/lib/clicks-analytics";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getTrackedLinkBySlug } from "@/lib/stores/tracked-links";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/links/:slug — analytics de cliques do link (total, por dia, por origem UTM).
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  // M6: em produção, o slug precisa pertencer ao tenant autenticado — senão
  // qualquer usuário logado lia os cliques/UTM de campanha de outro tenant (IDOR).
  if (USE_SUPABASE) {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    const link = await getTrackedLinkBySlug(slug);
    if (!link || link.tenant_id !== tenantId) {
      return Response.json({ error: "Link não encontrado." }, { status: 404 });
    }
  }

  return Response.json(await getClickAnalytics(slug));
}
