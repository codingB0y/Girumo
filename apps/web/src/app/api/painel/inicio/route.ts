import { resolverPartes } from "@/lib/painel/inicio-resposta";
import {
  carregarAgendamentos,
  carregarCampanhas,
  carregarDisparos,
  carregarGrupos,
  carregarLeads,
  carregarLinks,
  carregarSessao,
} from "@/lib/painel/inicio-carga";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listAutomations } from "@/lib/stores/automations";
import { listOrdersByTenant } from "@/lib/stores/orders";
import { getTenantSettings } from "@/lib/stores/tenant-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/painel/inicio — a carga inteira da tela Início numa resposta só.
 *
 * A Início dependia de dez chamadas, e o navegador as fazia em fila. Cada uma
 * resolvia o tenant por conta própria, e resolver tenant não é barato: são três
 * idas ao Supabase (usuário, revogação da sessão, membership). Dez rotas = trinta
 * idas só para descobrir de quem é a tela, antes de qualquer dado.
 *
 * Aqui o tenant é resolvido UMA vez e os dez stores rodam em paralelo do lado do
 * servidor, onde a latência até o banco é baixa e o limite de conexões do
 * navegador não existe.
 *
 * As dez rotas soltas continuam de pé: outras telas as consomem, e cada uma
 * chama exatamente a mesma função de carga que esta rota chama.
 *
 * Cada parte carrega seu próprio `ok` porque uma parte que falha não pode
 * derrubar a tela — é a distinção entre "não deu pra carregar" e "carregou com
 * um pedaço faltando" que a Início já fazia com dez `fetch` separados.
 */
export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  const partes = await resolverPartes({
    groups: () => carregarGrupos(tenantId),
    campanhas: () => carregarCampanhas(tenantId),
    links: () => carregarLinks(tenantId),
    leads: () => carregarLeads(tenantId),
    orders: () => listOrdersByTenant(tenantId),
    schedules: () => carregarAgendamentos(tenantId),
    disparos: () => carregarDisparos(tenantId),
    automations: () => listAutomations(tenantId),
    session: () => carregarSessao(tenantId),
    settings: () => getTenantSettings(tenantId),
  });

  return Response.json(partes);
}
