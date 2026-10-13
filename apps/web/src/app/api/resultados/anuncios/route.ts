import { hasPermission } from "@/lib/permissions";
import { periodoDaBusca } from "@/lib/resultados/periodo-anuncios";
import { semGasto, type RelatorioParaTela, type RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { PeriodoRecusado, relatorioDeAnuncios, temCadastroComOrigem } from "@/lib/stores/relatorio-de-anuncios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/resultados/anuncios?de=YYYY-MM-DD&ate=YYYY-MM-DD — o funil de anúncios
 * da loja (spec 2026-10-10-funil-anuncios §3). Sem datas: últimos 30 dias em
 * Brasília. O tenant é sempre o da sessão, nunca o da query string.
 *
 * A vendedora não chega aqui: a rota não está em `lib/auth/modulos.ts`, e o guard
 * de `getTenantContext` responde 403 a tudo que não está no mapa dela. O operador lê
 * o funil, mas sem nenhum gasto (`semGasto`): gasto exige `ads:manage` (spec §3).
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  let veGasto: boolean;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    tenantId = ctx.tenantId;
    veGasto = ctx.role !== null && hasPermission(ctx.role, "ads:manage");
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/resultados/anuncios] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  const lido = periodoDaBusca(new URL(req.url).searchParams, new Date());
  if (!lido.ok) return resposta({ error: lido.erro }, 400);

  try {
    const relatorio = await relatorioDeAnuncios(tenantId, lido.periodo);
    // Cadastro no período já prova que a loja tem: a segunda consulta só roda no zero.
    const tem_cadastro = relatorio.total.cadastros > 0 || (await temCadastroComOrigem(tenantId));
    const paraTela: RelatorioParaTela = veGasto ? relatorio : semGasto(relatorio);
    const corpo: RespostaAnuncios = { relatorio: paraTela, tem_cadastro };
    return resposta(corpo, 200);
  } catch (e) {
    if (e instanceof PeriodoRecusado) return resposta({ error: "Período inválido." }, 400);
    console.error(`[api/resultados/anuncios] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para montar o funil dos anúncios." }, 500);
  }
}
