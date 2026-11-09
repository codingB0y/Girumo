import { isCronAuthorized } from "@/lib/cron-auth";
import { rodarCronRastreio } from "@/lib/rastreio/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/rastreio — a cada 5 min pelo Vercel Cron (vercel.json), com `Authorization: Bearer
 * <CRON_SECRET>`. Liga as lojas novas, varre os pedidos mexidos e, às 06:00 UTC, purga a base.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await rodarCronRastreio(new Date())) });
  } catch (e) {
    // Só a lista de lojas lança (o resto é capturado por passo); daqui a 5 min tenta de novo.
    console.error(`[rastreio/cron] ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ error: "falhou" }, { status: 500 });
  }
}
