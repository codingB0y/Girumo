import { claimBulk } from "@/lib/stores/group-bulk-jobs";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/groups/bulk/pending — o WORKER reivindica a próxima ação em massa.
 *
 * Devolve no máximo `CLAIM_LIMIT` jobs: o tamanho do lote é metade do anti-ban
 * (a outra metade é o intervalo do tick no worker).
 *
 * No PR 3 esta rota passa a materializar o horário de funcionamento ANTES do
 * claim, como `/grow/pending` faz com `evaluateAutoGrow` — a decisão fica no
 * app, o worker continua burro. Por ora, só claima.
 */
export async function POST(req: Request) {
  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
    return Response.json(await claimBulk(tenantId));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/bulk/pending] falha ao reivindicar:", error);
    return Response.json({ error: "Erro ao reivindicar ações em massa." }, { status: 500 });
  }
}
