// apps/web/src/app/rastreio/[slug]/[token]/parar/route.ts
import { responderParar } from "@/lib/rastreio/rota-publica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /rastreio/:slug/:token/parar — para os avisos do pedido (ver responderParar).
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await ctx.params;
  return responderParar(req, slug, token);
}

// responderParar responde 405 a todo método que não é POST, sem consultar nada: a prévia do
// WhatsApp e o prefetch abrem o endereço sozinhos.
export const GET = POST;
export const HEAD = POST;
