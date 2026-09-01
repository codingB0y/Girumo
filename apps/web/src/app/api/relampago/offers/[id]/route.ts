import { closeOffer, getOffer, listQueue, releaseExpired } from "@/lib/stores/flash-offers";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;

    const oferta = await getOffer(ctx.tenantId, id);
    if (!oferta) return Response.json({ error: "nao encontrada" }, { status: 404 });

    // Recicla o vencido ANTES de servir. É o que substitui o cron.
    await releaseExpired(ctx.tenantId, id);

    return Response.json({
      offer: oferta,
      queue: await listQueue(ctx.tenantId, id),
      me: ctx.authUserId,
      now: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;
    await closeOffer(ctx.tenantId, id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
