import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { latestBatchProgress } from "@/lib/stores/group-bulk-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/[slug]/grupos/lotes — progresso do lote mais recente.
 *
 * A tela faz polling disto a cada 3s enquanto houver job pendente. Polling e não
 * realtime porque o realtime do app é decorativo (`postgres_changes` sem evento
 * configurado) — uma barra que depende dele nunca se moveria.
 *
 * Não carrega os grupos de propósito: a cada 3 segundos, um `listGroups` por
 * batida seria uma query cara para responder um contador.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);
    return Response.json(await latestBatchProgress(tenantId, campaign.id));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/lotes] falha ao ler progresso:", error);
    return Response.json({ error: "Erro ao ler o progresso do lote." }, { status: 500 });
  }
}
