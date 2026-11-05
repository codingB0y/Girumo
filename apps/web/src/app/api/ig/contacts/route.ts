import { requirePessoas } from "@/lib/ig/access";
import { lerFiltrosDaUrl, nomesDosFluxos, paraPessoa, responderErro } from "@/lib/ig/pessoas-http";
import type { ListaDePessoas } from "@/lib/ig/pessoas-tipos";
import { listContacts, PAGE_SIZE } from "@/lib/stores/ig-contacts-lista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ig/contacts?q=&tags=a,b&campo=&valor=&recencia=24h|7d|30d|tudo&pagina=1 — uma página (50) de Pessoas.
export async function GET(req: Request) {
  try {
    const { ctx, acesso } = await requirePessoas(req, "ler");
    const entrada = lerFiltrosDaUrl(new URL(req.url).searchParams);
    if (!entrada) return Response.json({ error: "Filtro inválido." }, { status: 400 });
    const [{ rows, total }, fluxos] = await Promise.all([listContacts(ctx.tenantId, entrada.filtros, entrada.pagina), nomesDosFluxos(ctx.tenantId)]);
    const corpo: ListaDePessoas = {
      pessoas: rows.map((r) => paraPessoa(r, fluxos)),
      total,
      pagina: entrada.pagina,
      tamanho: PAGE_SIZE,
      acesso: { somenteLeitura: acesso.somenteLeitura, fichasSomemEm: acesso.fichasSomemEm, podeApagar: acesso.podeApagar, podeExportar: acesso.podeExportar },
    };
    return Response.json(corpo);
  } catch (e) {
    return responderErro(e);
  }
}
