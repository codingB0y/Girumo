import { summarizeProtection } from "@/lib/groups/admin-protection";
import { listGroupsForProtection } from "@/lib/stores/groups";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/groups/protecao
 *
 * Quais grupos ficam sem administrador se o número do lojista cair — o único
 * cenário em que o produto perde algo irrecuperável (R1 da análise competitiva
 * de 28/08). Só leitura.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const groups = await listGroupsForProtection(ctx.tenantId);
    return Response.json(summarizeProtection(groups));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/protecao] falha lendo proteção dos grupos:", error);
    return Response.json({ error: "Erro ao ler a proteção dos grupos." }, { status: 500 });
  }
}
