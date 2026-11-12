import "server-only";
import { ENTRADAS_E_SAIDAS_DESDE, janelasDaAtividade, somaDa, type AtividadeDaCampanha } from "@/lib/painel/atividade";
import { campaignActivity, campaignGroupMemberCounts, campaignPostLeaves } from "@/lib/stores/campaign-activity";
import { listGroupsCreatedSince, listGroupsCreatedSinceByTenant } from "@/lib/stores/group-grow-jobs";

/**
 * A análise de entradas, saídas e cliques num formato só, para a página da
 * campanha e para a Início. `campanhaId` nulo = a loja inteira: os grupos são
 * todos os do tenant, os cliques, de todos os links, e os grupos abertos hoje,
 * de todas as campanhas.
 */
export async function carregarAtividade(
  tenantId: string,
  alvo: { campanhaId: string | null; groupIds: string[] },
  agora: Date,
): Promise<AtividadeDaCampanha> {
  const janelas = janelasDaAtividade(agora);
  const campanha = { id: alvo.campanhaId, groupIds: alvo.groupIds };
  const [porHora, porDia, antes, hojePorGrupo, abertos, saidasDepoisDoPost] = await Promise.all([
    campaignActivity(tenantId, campanha, janelas.porHora),
    campaignActivity(tenantId, campanha, janelas.porDia),
    campaignActivity(tenantId, campanha, janelas.semanaPassada),
    campaignGroupMemberCounts(tenantId, alvo.groupIds, janelas.porHora),
    alvo.campanhaId
      ? listGroupsCreatedSince(tenantId, alvo.campanhaId, janelas.porHora.de.toISOString())
      : listGroupsCreatedSinceByTenant(tenantId, janelas.porHora.de.toISOString()),
    // Falhar aqui não derruba o gráfico: a tela diz que esta parte não carregou.
    alvo.campanhaId
      ? campaignPostLeaves(tenantId, { id: alvo.campanhaId, groupIds: alvo.groupIds }, janelas.porDia).catch((e: unknown) => {
          console.error("[atividade] falha ao ler as saídas depois de cada post:", e);
          return null;
        })
      : undefined,
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
    ...(saidasDepoisDoPost === undefined ? {} : { saidasDepoisDoPost }),
  };
}
