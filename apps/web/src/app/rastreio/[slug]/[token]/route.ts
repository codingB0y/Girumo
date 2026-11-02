// apps/web/src/app/rastreio/[slug]/[token]/route.ts
import { responderPedido } from "@/lib/rastreio/rota-publica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /rastreio/:slug/:token — um pedido só, pelo link do aviso (ver responderPedido). Nunca grava.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  return responderPedido(req, slug, token);
}

export const HEAD = GET;
