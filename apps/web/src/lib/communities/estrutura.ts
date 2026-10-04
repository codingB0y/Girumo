import type { PapelComunidade } from "./papel";

/**
 * Um grupo-pai de comunidade ou seu grupo de Avisos nao e um grupo de envio:
 * o pai e um conteiner (1 membro) e o Avisos alcanca a comunidade inteira.
 * Os dois precisam sumir da lista de disparo E da faixa de orfaos, senao a
 * tela oferece como "sem comunidade" justamente as duas pecas da comunidade.
 *
 * `community_role` em snake_case porque os dois chamadores (`inicio-carga.ts`
 * e `api/comunidades/route.ts`) leem `groupsStore.listGroups()`, que devolve
 * o `Group` de `lib/stores/groups.ts` — mesmo shape nos dois, sem conversao.
 */
export type GrupoComPapel = { community_role?: PapelComunidade | null };

export function ehEstruturaDeComunidade(g: GrupoComPapel): boolean {
  return g.community_role === "parent" || g.community_role === "announce";
}

/** Os ids de WhatsApp dos grupos que são estrutura (pai e Avisos). */
export function idsDeEstrutura(grupos: ReadonlyArray<GrupoComPapel & { whatsapp_group_id: string }>): Set<string> {
  return new Set(grupos.filter(ehEstruturaDeComunidade).map((g) => g.whatsapp_group_id));
}

/**
 * Tira dos `groupIds` da campanha os ids de estrutura. Eles existem, mas saem da
 * lista de grupos (`carregarGrupos`); sem isto o mapa da Início, que acusa "sumiu"
 * para todo id que não acha na lista, acusaria o pai ou o Avisos posto à mão na campanha.
 */
export function semEstrutura<C extends { groupIds: string[] }>(campanhas: C[], estrutura: ReadonlySet<string>): C[] {
  if (estrutura.size === 0) return campanhas;
  return campanhas.map((c) => ({ ...c, groupIds: c.groupIds.filter((id) => !estrutura.has(id)) }));
}
