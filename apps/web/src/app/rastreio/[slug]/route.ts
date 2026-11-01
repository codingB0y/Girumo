// apps/web/src/app/rastreio/[slug]/route.ts
import { responderBusca } from "@/lib/rastreio/rota-publica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /rastreio/:slug — a busca do pedido; POST — a busca feita (ver responderBusca).
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return responderBusca(req, slug);
}

export const POST = GET;
export const HEAD = GET;
