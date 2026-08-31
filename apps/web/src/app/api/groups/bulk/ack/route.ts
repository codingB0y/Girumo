import { ackBulk } from "@/lib/stores/group-bulk-jobs";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/groups/bulk/ack — o WORKER reporta o resultado de uma ação.
 * body { id, status: "done"|"failed", error? }
 *
 * Só dois status terminais: não existe `running` intermediário como no
 * auto-grow, porque aqui a operação é UMA chamada, não uma sequência
 * create → descrição → foto → convite que valha reportar em etapas.
 */
export async function POST(req: Request) {
  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const id = body.id ? String(body.id) : "";
    const status = body.status as "done" | "failed";
    if (!id || !["done", "failed"].includes(status)) {
      return Response.json({ error: "id e status válidos são obrigatórios." }, { status: 400 });
    }

    const job = await ackBulk(tenantId, id, {
      status,
      error: typeof body.error === "string" ? body.error : null,
    });
    if (!job) return Response.json({ error: "Job não encontrado." }, { status: 404 });

    return Response.json(job);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/bulk/ack] falha ao registrar resultado:", error);
    return Response.json({ error: "Erro ao registrar o resultado." }, { status: 500 });
  }
}
