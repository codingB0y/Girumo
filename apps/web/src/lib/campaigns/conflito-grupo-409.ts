import "server-only";
import { lerConflitoGrupo, mensagemConflito } from "@/lib/campaigns/conflito-grupo";
import { getCampaignGroupById } from "@/lib/stores/campaign-groups";

/**
 * O 409 do contrato (`{ error, grupo, campanha: { id, name } }`) quando o erro é a recusa do
 * trigger `campaign_groups_grupo_exclusivo`; `null` para qualquer outro erro, que o chamador
 * relança. Usado por POST/PATCH /api/campanhas e POST /api/comunidades/[slug]/grupos.
 */
export async function respostaConflitoGrupo(tenantId: string, erro: unknown): Promise<Response | null> {
  const conflito = lerConflitoGrupo(erro instanceof Error ? erro.message : String(erro));
  if (!conflito) return null;
  // A outra campanha é da mesma loja (o trigger só compara dentro do tenant). Sem o nome a
  // resposta continua 409: falhar esta leitura não pode virar 500 de um erro já entendido.
  const outra = await getCampaignGroupById(tenantId, conflito.campanhaId).catch((e: unknown) => {
    console.error("[conflito-grupo] nome da outra campanha:", e);
    return null;
  });
  const name = outra?.name ?? "outra campanha";
  return Response.json(
    { error: mensagemConflito(null, name), grupo: conflito.jid, campanha: { id: conflito.campanhaId, name } },
    { status: 409 },
  );
}
