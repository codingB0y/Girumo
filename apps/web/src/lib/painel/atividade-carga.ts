import "server-only";
import { ENTRADAS_E_SAIDAS_DESDE, janelasDaAtividade, somaDa, type AtividadeDaCampanha } from "@/lib/painel/atividade";
import { campaignActivity, campaignGroupMemberCounts } from "@/lib/stores/campaign-activity";
import { listGroupsCreatedSince } from "@/lib/stores/group-grow-jobs";

/**
 * A análise de entradas, saídas e cliques num formato só, para a página da
 * campanha e para a Início. `campanhaId` nulo = a loja inteira: os grupos são
 * todos os do tenant e os cliques, de todos os links.
 */
export async function carregarAtividade(
  tenantId: string,
  alvo: { campanhaId: string | null; groupIds: string[] },
  agora: Date,
): Promise<AtividadeDaCampanha> {
  const janelas = janelasDaAtividade(agora);
  const campanha = { id: alvo.campanhaId, groupIds: alvo.groupIds };
  const [porHora, porDia, antes, hojePorGrupo, abertos] = await Promise.all([
    campaignActivity(tenantId, campanha, janelas.porHora),
    campaignActivity(tenantId, campanha, janelas.porDia),
    campaignActivity(tenantId, campanha, janelas.semanaPassada),
    campaignGroupMemberCounts(tenantId, alvo.groupIds, janelas.porHora),
    alvo.campanhaId ? listGroupsCreatedSince(tenantId, alvo.campanhaId, janelas.porHora.de.toISOString()) : Promise.resolve([]),
  ]);

  return {
    geradoEm: agora.toISOString(),
    entradasDesde: new Date(ENTRADAS_E_SAIDAS_DESDE).toISOString(),
    porHora,
    porDia,
    semanaPassada: {
      novas: somaDa(antes, "novas"),
      cliques: somaDa(antes, "cliques"),
      entraram: somaDa(antes, "entraram"),
      sairam: somaDa(antes, "sairam"),
    },
    hojePorGrupo,
    gruposAbertosHoje: abertos.map((g) => ({ nome: g.subject, seq: g.seq, grupo: g.whatsapp_group_id, quando: g.updated_at })),
  };
}
