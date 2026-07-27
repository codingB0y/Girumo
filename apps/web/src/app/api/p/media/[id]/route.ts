import { readPublicLpMedia } from "@/lib/media-store";

export const runtime = "nodejs";

/**
 * GET /api/p/media/:id — entrega PÚBLICA da mídia de landing page (sem sessão).
 *
 * Vive sob `api/p/` porque esse prefixo já é público no matcher do middleware,
 * junto do resto do Flow Pages. A autorização NÃO é o id (que é só o storage path
 * em base64url): é o `kind` gravado no upload — só `lp-media`/`lp-logo` saem por
 * aqui, então mídia privada de campanha nunca vaza mesmo com o id em mãos.
 *
 * O visitante não recebe este arquivo direto: o `next/image` consome esta rota
 * (same-origin, sem allowlist) e serve o DERIVADO otimizado (webp/avif + srcset).
 * Imutável no cache porque o id muda a cada upload (path com uuid novo).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const media = await readPublicLpMedia(id);
  if (!media) return new Response("Não encontrado.", { status: 404 });

  return new Response(new Uint8Array(media.buffer), {
    headers: {
      "content-type": media.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
