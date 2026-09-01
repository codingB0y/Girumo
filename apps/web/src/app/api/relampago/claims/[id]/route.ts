import { markContacted, settleClaim } from "@/lib/stores/flash-offers";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { action?: string } | null;

    switch (body?.action) {
      case "contacted":
        await markContacted(ctx.tenantId, id);
        return Response.json({ ok: true });
      case "sold":
      case "dropped":
        await settleClaim(ctx.tenantId, id, body.action);
        return Response.json({ ok: true });
      default:
        return Response.json({ error: "acao invalida" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
