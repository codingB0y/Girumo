/**
 * Lotação de comunidade nativa do WhatsApp.
 *
 * O WhatsApp aceita 2.000 pessoas únicas por comunidade (Avisos + grupos vinculados). Cheia, ela
 * fecha: ninguém mais entra em grupo nenhum vinculado a ela até alguém sair. O link de convite do
 * grupo continua no ar e a pessoa é barrada na porta. Para uma loja que capta gente pelos grupos,
 * isso é captação parada sem aviso nenhum.
 *
 * O `members` do Avisos é a comunidade inteira, já deduplicada pelo WhatsApp (somar os grupos
 * contaria duas vezes quem está em dois). Por isso o aviso lê só o Avisos: comunidade sem Avisos
 * nosso não tem número confiável e fica de fora.
 */

/** Teto do WhatsApp para pessoas únicas numa comunidade. */
export const TETO_DA_COMUNIDADE = 2000;

/** A partir daqui avisamos: 90% do teto, tempo de abrir outra comunidade antes de barrar gente. */
export const AVISO_A_PARTIR_DE = 1800;

/** Um aviso por comunidade por semana, enquanto ela seguir perto do teto. */
export const REPOUSO_DO_AVISO_DIAS = 7;

export const TIPO_DO_AVISO = "comunidade_quase_cheia";

/** O que o sync acabou de ler de cada grupo que administramos. */
export type GrupoLido = {
  whatsapp_group_id: string;
  name: string;
  members: number;
  community_jid: string | null;
  community_role: string | null;
};

export type ComunidadeLotando = {
  communityJid: string;
  nome: string;
  avisoJid: string;
  pessoas: number;
  /** Já no teto: o WhatsApp não deixa mais ninguém entrar nos grupos vinculados. */
  cheia: boolean;
};

export type AvisoDoSino = { type: string; title: string; body: string; href: string };

/** As comunidades em que somos admin do Avisos e que já passaram de `AVISO_A_PARTIR_DE`, maiores primeiro. */
export function comunidadesLotando(grupos: readonly GrupoLido[]): ComunidadeLotando[] {
  const porJid = new Map<string, GrupoLido[]>();
  for (const g of grupos) {
    if (!g.community_jid || !g.community_role) continue;
    const atual = porJid.get(g.community_jid);
    if (atual) atual.push(g);
    else porJid.set(g.community_jid, [g]);
  }

  const saida: ComunidadeLotando[] = [];
  for (const [communityJid, doJid] of porJid) {
    // Só o Avisos sabe quantas pessoas a comunidade tem. Só chega aqui o Avisos que administramos
    // (o sync filtra por admin antes), e é só nesse que podemos agir.
    const aviso = doJid.find((g) => g.community_role === "announce");
    if (!aviso || aviso.members < AVISO_A_PARTIR_DE) continue;
    const pai = doJid.find((g) => g.community_role === "parent");
    saida.push({
      communityJid,
      nome: (pai ?? aviso).name,
      avisoJid: aviso.whatsapp_group_id,
      pessoas: aviso.members,
      cheia: aviso.members >= TETO_DA_COMUNIDADE,
    });
  }
  return saida.sort((a, b) => b.pessoas - a.pessoas || a.communityJid.localeCompare(b.communityJid));
}

/**
 * O aviso do sino. O `href` leva o JID da comunidade de propósito: é a chave pela qual o sync não
 * repete o aviso dentro de `REPOUSO_DO_AVISO_DIAS` (a tabela não tem coluna de metadados).
 */
export function avisoDaComunidade(c: ComunidadeLotando): AvisoDoSino {
  const pessoas = c.pessoas.toLocaleString("pt-BR");
  const teto = TETO_DA_COMUNIDADE.toLocaleString("pt-BR");
  const saida = "Crie outra comunidade e vincule nela os grupos que ainda crescem.";
  return {
    type: TIPO_DO_AVISO,
    title: c.cheia ? `Comunidade "${c.nome}" chegou ao limite` : `Comunidade "${c.nome}" quase cheia`,
    body: c.cheia
      ? `${pessoas} pessoas: é o máximo do WhatsApp. Ninguém mais consegue entrar nos grupos vinculados a ela até alguém sair. ${saida}`
      : `${pessoas} de ${teto} pessoas. Ao chegar a ${teto}, o WhatsApp barra quem tentar entrar em qualquer grupo vinculado a ela. ${saida}`,
    href: `/painel/comunidades?comunidade=${encodeURIComponent(c.communityJid)}`,
  };
}
