import { semEstrutura } from "@/lib/communities/estrutura";
import { resolverPartes } from "@/lib/painel/inicio-resposta";
import {
  carregarAgendamentos,
  carregarCampanhas,
  carregarDisparos,
  carregarGruposEEstrutura,
  carregarLeads,
  carregarLinks,
  carregarSessao,
} from "@/lib/painel/inicio-carga";
import { janelasDaAtividade } from "@/lib/painel/atividade";
import { carregarAtividade } from "@/lib/painel/atividade-carga";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listOfertasDaInicio, offerTotalsByBroadcastIds } from "@/lib/stores/flash-offers";
import { listOrdersByTenant } from "@/lib/stores/orders";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/painel/inicio — a carga inteira da tela Início numa resposta só.
 *
 * A Início dependia de nove chamadas, e o navegador as fazia em fila. Cada uma
 * resolvia o tenant por conta própria, e resolver tenant não é barato: são três
 * idas ao Supabase (usuário, revogação da sessão, membership). Nove rotas = vinte
 * e sete idas só para descobrir de quem é a tela, antes de qualquer dado.
 *
 * Aqui o tenant é resolvido UMA vez e as partes rodam em paralelo do lado do
 * servidor, onde a latência até o banco é baixa e o limite de conexões do
 * navegador não existe.
 *
 * As nove rotas soltas continuam de pé: outras telas as consomem, e cada uma
 * chama exatamente a mesma função de carga que esta rota chama.
 *
 * Cada parte carrega seu próprio `ok` porque uma parte que falha não pode
 * derrubar a tela — é a distinção entre "não deu pra carregar" e "carregou com
 * um pedaço faltando" que a Início já fazia com nove `fetch` separados.
 */
export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // Os grupos são lidos uma vez e servem a duas partes: a lista e a atividade da loja.
  const lidos = carregarGruposEEstrutura(tenantId);
  const grupos = lidos.then((l) => l.grupos);
  const partes = await resolverPartes({
    groups: () => grupos,
    campanhas: async () =>
      semEstrutura<Awaited<ReturnType<typeof carregarCampanhas>>[number]>(await carregarCampanhas(tenantId), (await lidos).estrutura),
    links: () => carregarLinks(tenantId),
    leads: () => carregarLeads(tenantId),
    orders: () => listOrdersByTenant(tenantId),
    schedules: () => carregarAgendamentos(tenantId),
    disparos: () => carregarDisparos(tenantId),
    session: () => carregarSessao(tenantId),
    settings: () => getTenantSettings(tenantId),
    // O JSON de dev não guarda entrada nem clique com data: sem banco não há série.
    atividade: async () =>
      USE_SUPABASE
        ? carregarAtividade(
            tenantId,
            { campanhaId: null, groupIds: (await grupos).map((g) => g.whatsappGroupId) },
            new Date(),
          )
        : null,
    // As ofertas Relâmpago da Início "Ao vivo". Supabase-only, como a própria tabela.
    relampago: async () => {
      if (!USE_SUPABASE) return null;
      const desde = janelasDaAtividade(new Date()).porHora.de.toISOString();
      const { abertas, doDia } = await listOfertasDaInicio(tenantId, desde);
      const broadcastIds = doDia.flatMap((o) => (o.broadcast_id ? [o.broadcast_id] : []));
      return { abertas, doDia, totaisDoDia: await offerTotalsByBroadcastIds(tenantId, broadcastIds) };
    },
  });

  return Response.json(partes);
}
