import { lerAcaoLotado, respostaDaAcao } from "@/lib/groups/acao-lotado";
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { listCampaignGroupStates, marcarGrupoLotado, reabrirGrupo } from "@/lib/stores/campaign-group-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/lotado
 * body { groupId: string (UUID de groups); acao: "marcar" | "reabrir" }
 *
 * Marca ou tira à mão a marca de lotado (spec D1/D2). `campaign:edit` pelo
 * `resolveBulkCampaign`, como as ações irmãs da aba Grupos. O grupo tem de estar nos estados
 * DESTA campanha (`lerAcaoLotado`); o RPC filtra o tenant de novo.
 *
 * O "ainda cheio" é decidido no UPDATE do banco (atômico). A contagem lida aqui só serve para
 * escrever a mensagem do 409.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const grupos = await listCampaignGroupStates(tenantId, campaign.id);
    const lido = lerAcaoLotado(body, grupos);
    if (!lido.ok) return Response.json({ error: lido.error }, { status: lido.status });

    const resultado =
      lido.acao === "marcar"
        ? await marcarGrupoLotado(tenantId, lido.grupo.groupId)
        : await reabrirGrupo(tenantId, lido.grupo.groupId);
    const { status, corpo } = respostaDaAcao(resultado, lido.grupo);
    return Response.json(corpo, { status });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/lotado] falha ao marcar ou reabrir:", error);
    return Response.json({ error: "Não deu para mudar o grupo." }, { status: 500 });
  }
}
