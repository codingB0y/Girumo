import { leadParaOPainel } from "@/lib/painel/inicio-carga";
import { periodoDaBusca } from "@/lib/resultados/periodo-anuncios";
import { anuncioDaBusca, paraAGaveta, type ContatosDoAnuncio } from "@/lib/resultados/pessoas-do-anuncio";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listLeadsByIds } from "@/lib/stores/leads";
import { PeriodoRecusado, pessoasDoAnuncio } from "@/lib/stores/relatorio-de-anuncios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERRO = "Não deu para carregar quem veio por este anúncio.";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/resultados/anuncios/pessoas?de&ate&campanha&conjunto&anuncio[&lista=]
 * (spec 2026-10-10-funil-anuncios §4 e §7). Sem `lista`: a gaveta "Ver quem" —
 * por onde, compradores com o telefone MASCARADO aqui e a contagem de quem entrou
 * sem comprar. Com `lista=compraram|sem-compra`: os contatos inteiros, para o
 * Contatos filtrado (que já mostra o número inteiro hoje).
 *
 * O tenant é sempre o da sessão. A vendedora não chega aqui: a rota não está em
 * `lib/auth/modulos.ts`. Não tem gasto nesta resposta, então operador lê igual.
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    tenantId = (await getRouteTenantContext(req, { allowEngine: false })).tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/resultados/anuncios/pessoas] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  const busca = new URL(req.url).searchParams;
  const periodo = periodoDaBusca(busca, new Date());
  if (!periodo.ok) return resposta({ error: periodo.erro }, 400);
  const anuncio = anuncioDaBusca(busca);
  if (!anuncio.ok) return resposta({ error: anuncio.erro }, 400);

  try {
    const pessoas = await pessoasDoAnuncio(tenantId, periodo.periodo, anuncio.chave);
    if (anuncio.lista === null) return resposta(paraAGaveta(pessoas), 200);

    const ids =
      anuncio.lista === "compraram"
        ? pessoas.compradores.flatMap((c) => (c.lead_id ? [c.lead_id] : []))
        : pessoas.sem_compra;
    const leads = await listLeadsByIds(tenantId, [...new Set(ids)]);
    const corpo: ContatosDoAnuncio = { contatos: leads.map(leadParaOPainel) };
    return resposta(corpo, 200);
  } catch (e) {
    if (e instanceof PeriodoRecusado) return resposta({ error: "Período inválido." }, 400);
    console.error(`[api/resultados/anuncios/pessoas] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: ERRO }, 500);
  }
}
