import { carregarContagemDeLeads } from "@/lib/painel/inicio-carga";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads/contagem — `{ total, clientes }`: quantos leads a loja tem, e
 * quantos compraram. Conta no banco; Resultados e o cancelamento contavam a
 * lista de /api/leads, que o PostgREST corta em 1000 linhas sem avisar.
 */
export async function GET(req: Request) {
  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    return Response.json(await carregarContagemDeLeads(tenantId));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/leads/contagem] falha ao contar:", error);
    return Response.json({ error: "Não deu para contar os contatos." }, { status: 500 });
  }
}
