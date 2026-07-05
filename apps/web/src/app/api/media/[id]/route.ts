import { readMedia } from "@/lib/media-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/media/:id — serve os bytes da foto (a engine baixa daqui, com token).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  const { id } = await ctx.params;
  const m = await readMedia(id, tenantId);
  if (!m) return new Response("Não encontrado.", { status: 404 });
  return new Response(new Uint8Array(m.buffer), {
    headers: { "content-type": m.contentType, "cache-control": "private, max-age=3600" },
  });
}
