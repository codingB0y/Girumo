import { assertPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { lerPostsHoje } from "@/lib/stores/posts-hoje";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/groups/posts-hoje — quantos posts cada grupo da loja já recebeu hoje
 * (dia de Brasília) e o teto do dia, para o composer avisar ANTES de postar.
 *
 * O teto vem do banco, junto da contagem; esta rota não tem número nenhum. Quem
 * pode ler é quem pode postar (`message:send`, como `POST /campanhas/[slug]/messages`),
 * inclusive a vendedora com o módulo de postar (mapa em `lib/auth/modulos.ts`).
 * Sem parâmetro de loja: o tenant é sempre o da sessão.
 */
export async function GET(req: Request) {
  if (!USE_SUPABASE) {
    return Response.json({ error: "A contagem de posts de hoje precisa do banco." }, { status: 501 });
  }

  try {
    const { tenantId, role } = await getRouteTenantContext(req, { allowEngine: false });
    // Sem papel é a engine, que `allowEngine: false` já barrou; o `if` estreita o tipo.
    if (!role) throw new Response("Sem permissão para esta ação.", { status: 403 });
    assertPermission(role, "message:send");

    return Response.json(await lerPostsHoje(tenantId));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/posts-hoje] falha ao ler:", error);
    return Response.json({ error: "Não deu para ler os posts de hoje." }, { status: 500 });
  }
}
