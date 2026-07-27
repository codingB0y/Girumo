import { getPublishedPageBySlug } from "@/lib/pages/store";
import { toPublicPagePayload } from "@/lib/pages/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Público: JSON da LP publicada (usado por health-checks e preview externo). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) {
    return Response.json({ error: "Slug inválido." }, { status: 400 });
  }

  try {
    const page = await getPublishedPageBySlug(slug);
    if (!page) return Response.json({ error: "Página não encontrada." }, { status: 404 });

    // Allowlist: destinos, IDs internos, tenant, versões e contadores não saem.
    return Response.json(toPublicPagePayload(page));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
