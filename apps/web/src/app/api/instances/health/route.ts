import { getInstanceHealth } from "@/lib/stores/instance-health";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/instances/health
 *
 * Estado anti-ban dos números do tenant (aquecimento, teto do dia, uso,
 * espaçamento, breaker) e o risco de queda por inatividade do celular.
 * Só leitura: nada aqui influencia o caminho de envio.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return Response.json({ numbers: await getInstanceHealth(ctx.tenantId) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/instances/health] falha lendo saúde do número:", error);
    return Response.json({ error: "Erro ao ler a saúde do número." }, { status: 500 });
  }
}
