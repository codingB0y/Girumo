import { handleShortLinkClick } from "@/lib/links/short-link-click";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /c/:slug — mesma resolução de /r/[slug], prefixo próprio pra quem
// compartilha o link de uma comunidade (em vez de uma campanha).
// Ver handleShortLinkClick para a lógica de rotação de grupo.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handleShortLinkClick(req, slug);
}
