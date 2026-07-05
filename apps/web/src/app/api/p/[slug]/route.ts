import { getPublishedPageBySlug } from "@/lib/pages/store";

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

    // Não vaza tenant_id nem contadores no endpoint público
    const publicPage: Partial<typeof page> = { ...page };
    delete publicPage.tenant_id;
    delete publicPage.views_count;
    delete publicPage.leads_count;
    return Response.json(publicPage);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
