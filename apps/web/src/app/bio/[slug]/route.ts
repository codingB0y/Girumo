// apps/web/src/app/bio/[slug]/route.ts
import { responderBio } from "@/lib/bio/rota-publica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /bio/:slug — página pública do link da bio (ver responderBio).
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return responderBio(req, slug);
}

// Explícito (o Next já faria o mesmo): HEAD cai no GET, e a visita não conta pelo `req.method`.
export const HEAD = GET;
