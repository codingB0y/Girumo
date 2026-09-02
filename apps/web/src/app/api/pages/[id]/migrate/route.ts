import { revalidateTag } from "next/cache";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getLandingPageById, migrateLandingPageToV3 } from "@/lib/pages/store";
import { planMigrationToV3 } from "@/lib/pages/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteProps = { params: Promise<{ id: string }> };

/**
 * Migra uma página do modelo editorial v2 para seções v3 (template acesso-vip).
 * Sem body. Não toca status, published_version, slug, campanha nem pixels; a
 * primeira v2 fica em `content_before_v3` para reversão manual (reverter e
 * migrar de novo é permitido; a cópia não é sobrescrita).
 */
export async function POST(req: Request, { params }: RouteProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "id inválido." }, { status: 400 });

  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const page = await getLandingPageById(ctx.tenantId, id);
    if (!page) return Response.json({ error: "Página não encontrada." }, { status: 404 });

    const plan = planMigrationToV3(page);
    if (!plan.ok) {
      if (plan.reason === "not_v2") {
        return Response.json({ error: "Só páginas do modelo anterior (v2) migram." }, { status: 409 });
      }
      // Invariante do adaptador quebrou: falha alto, sem gravar nada.
      return Response.json(
        { error: "A migração produziu conteúdo inválido.", details: plan.errors },
        { status: 500 },
      );
    }

    const updated = await migrateLandingPageToV3(ctx.tenantId, id, plan.patch, page.updated_at);
    if (!updated) {
      return Response.json(
        { error: "A página mudou durante a migração. Tente novamente." },
        { status: 409 },
      );
    }

    // Mesma invalidação do PATCH: uma página publicada passa a servir o render v3 em segundos.
    revalidateTag(`lp:${updated.slug}`);

    return Response.json({ page: updated });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
