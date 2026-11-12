/**
 * Plano de comunidades: em quantas comunidades do WhatsApp dividir os grupos de uma loja e quais
 * grupos vão em cada uma. Só o plano. A Girumo não cria nem vincula nada: o lojista faz no celular
 * (a Evolution 2.3.7 não tem rota de comunidade, e o fork do Baileys foi cancelado em 17/09/2026).
 * O plano distribui grupos, nunca pessoas: mover gente entre grupos é adicionar por número.
 *
 * A regra é a do plano feito à mão em 09/11/2026 para uma loja (37 grupos, 6 comunidades):
 * - nenhuma comunidade passa do teto do WhatsApp (pessoas e grupos), nem no pior caso;
 * - no máximo um grupo grande por comunidade, porque dois grandes cheios já passam do teto;
 * - as comunidades ficam equilibradas pelo pior caso: cada grande cheio e cada pequeno dobrando.
 */

import { TETO_DA_COMUNIDADE } from "./lotacao";

/** Teto do WhatsApp para pessoas num grupo. */
export const TETO_DO_GRUPO = 1024;

/** Teto do WhatsApp para grupos vinculados numa comunidade. */
export const GRUPOS_POR_COMUNIDADE = 100;

/** A partir daqui o grupo é grande: no pior caso ele enche até `TETO_DO_GRUPO`. */
export const GRUPO_GRANDE_A_PARTIR_DE = 700;

/** Até aqui o grupo é interno da loja (entregas, caixa, conferência) e fica fora do plano por padrão. */
export const GRUPO_INTERNO_ATE = 4;

/**
 * `group_participants` nunca apaga quem saiu: cada sync só regrava `last_seen_at` de quem está.
 * Conta como "hoje" só a linha lida até uma hora antes da leitura mais recente do grupo (medido em
 * prod em 12/11/2026: 1.028 linhas num grupo de 874 pessoas, 880 dentro da janela).
 */
export const JANELA_DA_ULTIMA_LEITURA_MS = 60 * 60 * 1000;

export type GrupoParaPlano = { whatsappGroupId: string; name: string; members: number };

export type ParticipanteLido = { whatsappGroupId: string; participantLid: string; lastSeenAt: string };

export type GrupoNoPlano = GrupoParaPlano & { grande: boolean; piorCaso: number };

export type ComunidadeDoPlano = {
  numero: number;
  grupos: GrupoNoPlano[];
  /** Soma dos membros menos quem aparece em mais de um grupo dela (quando sabemos). */
  pessoasHoje: number;
  /** Soma do pior caso de cada grupo. Nunca passa de `TETO_DA_COMUNIDADE`. */
  piorCaso: number;
  /** Algum grupo dela não tem participantes lidos: `pessoasHoje` é soma, estimativa por cima. */
  pessoasEstimadas: boolean;
};

export type PlanoDeComunidades = {
  comunidades: ComunidadeDoPlano[];
  /** Grupo que sozinho já passa do teto da comunidade: não cabe em nenhuma. */
  naoCabem: GrupoParaPlano[];
  pessoasHoje: number;
  pessoasEstimadas: boolean;
};

/** Um grupo que a tela oferece para o plano (`POST /api/comunidades/plano`). */
export type CandidatoAoPlano = {
  whatsappGroupId: string;
  name: string;
  members: number;
  interno: boolean;
  grande: boolean;
  incluido: boolean;
};

export type RespostaDoPlano = { candidatos: CandidatoAoPlano[]; plano: PlanoDeComunidades };

export function ehGrupoInterno(members: number): boolean {
  return members <= GRUPO_INTERNO_ATE;
}

export function ehGrupoGrande(members: number): boolean {
  return members >= GRUPO_GRANDE_A_PARTIR_DE;
}

/** Até onde o grupo pode chegar: o grande enche, o pequeno dobra, e nenhum passa do teto do grupo. */
export function piorCasoDoGrupo(members: number): number {
  if (ehGrupoGrande(members)) return Math.max(members, TETO_DO_GRUPO);
  return Math.min(members * 2, TETO_DO_GRUPO);
}

export function montarPlano(
  grupos: readonly GrupoParaPlano[],
  participantes: readonly ParticipanteLido[] = [],
): PlanoDeComunidades {
  const unicos = [...new Map(grupos.map((g) => [g.whatsappGroupId, g])).values()];
  const noPlano: GrupoNoPlano[] = unicos.map((g) => ({
    ...g,
    grande: ehGrupoGrande(g.members),
    piorCaso: piorCasoDoGrupo(g.members),
  }));

  const naoCabem = unicos.filter((g) => piorCasoDoGrupo(g.members) > TETO_DA_COMUNIDADE);
  const cabem = noPlano
    .filter((g) => g.piorCaso <= TETO_DA_COMUNIDADE)
    .sort(
      (a, b) =>
        b.piorCaso - a.piorCaso ||
        b.members - a.members ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.whatsappGroupId.localeCompare(b.whatsappGroupId),
    );

  const lidos = participantesDeHoje(participantes);
  const caixas = cabem.length === 0 ? [] : distribuirNoMenorNumero(cabem);
  const comunidades = caixas.map((doGrupo, i) => {
    const ordenados = [...doGrupo].sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, "pt-BR"));
    const { pessoas, estimadas } = pessoasUnicas(ordenados, lidos);
    return {
      numero: i + 1,
      grupos: ordenados,
      pessoasHoje: pessoas,
      piorCaso: ordenados.reduce((total, g) => total + g.piorCaso, 0),
      pessoasEstimadas: estimadas,
    };
  });

  const total = pessoasUnicas(cabem, lidos);
  return { comunidades, naoCabem, pessoasHoje: total.pessoas, pessoasEstimadas: total.estimadas };
}

/**
 * Começa pelo menor número de comunidades que a conta permite e sobe até caber. Sempre termina:
 * com uma comunidade por grupo, todo grupo que chega aqui cabe sozinho.
 */
function distribuirNoMenorNumero(grupos: readonly GrupoNoPlano[]): GrupoNoPlano[][] {
  const somaDoPiorCaso = grupos.reduce((total, g) => total + g.piorCaso, 0);
  // Dois grupos acima da metade do teto nunca dividem comunidade: cada um pede a sua.
  const naoDividem = grupos.filter((g) => g.piorCaso > TETO_DA_COMUNIDADE / 2).length;
  let quantas = Math.max(
    1,
    naoDividem,
    Math.ceil(somaDoPiorCaso / TETO_DA_COMUNIDADE),
    Math.ceil(grupos.length / GRUPOS_POR_COMUNIDADE),
  );
  for (;;) {
    const caixas = distribuir(grupos, quantas);
    if (caixas) return caixas;
    quantas += 1;
  }
}

/**
 * Do maior pior caso para o menor, cada grupo vai para a comunidade com menos pior caso onde ainda
 * cabe. `null` quando algum grupo não cabe em nenhuma das `quantas`. "Um grande por comunidade" não
 * precisa de regra própria: dois grandes somam 2.048 de pior caso e já não cabem.
 */
function distribuir(grupos: readonly GrupoNoPlano[], quantas: number): GrupoNoPlano[][] | null {
  const caixas = Array.from({ length: quantas }, () => ({ grupos: [] as GrupoNoPlano[], piorCaso: 0 }));
  for (const g of grupos) {
    let destino: (typeof caixas)[number] | null = null;
    for (const c of caixas) {
      if (c.piorCaso + g.piorCaso > TETO_DA_COMUNIDADE) continue;
      if (c.grupos.length >= GRUPOS_POR_COMUNIDADE) continue;
      if (!destino || c.piorCaso < destino.piorCaso) destino = c;
    }
    if (!destino) return null;
    destino.grupos.push(g);
    destino.piorCaso += g.piorCaso;
  }
  return caixas.map((c) => c.grupos);
}

/** Os participantes de cada grupo na leitura mais recente dele, sem quem já saiu. */
function participantesDeHoje(participantes: readonly ParticipanteLido[]): Map<string, Set<string>> {
  const ultimaLeitura = new Map<string, number>();
  for (const p of participantes) {
    const quando = Date.parse(p.lastSeenAt);
    if (Number.isNaN(quando)) continue;
    ultimaLeitura.set(p.whatsappGroupId, Math.max(ultimaLeitura.get(p.whatsappGroupId) ?? quando, quando));
  }

  const porGrupo = new Map<string, Set<string>>();
  for (const p of participantes) {
    const ultima = ultimaLeitura.get(p.whatsappGroupId);
    const quando = Date.parse(p.lastSeenAt);
    if (ultima === undefined || Number.isNaN(quando) || quando < ultima - JANELA_DA_ULTIMA_LEITURA_MS) continue;
    const atual = porGrupo.get(p.whatsappGroupId);
    if (atual) atual.add(p.participantLid);
    else porGrupo.set(p.whatsappGroupId, new Set([p.participantLid]));
  }
  return porGrupo;
}

/**
 * Soma dos membros menos quem aparece em mais de um grupo. A base é `members` (a contagem diária é
 * mais nova que a última lista de participantes); dos participantes só sai quem se repete.
 */
function pessoasUnicas(
  grupos: readonly GrupoParaPlano[],
  lidos: ReadonlyMap<string, ReadonlySet<string>>,
): { pessoas: number; estimadas: boolean } {
  const soma = grupos.reduce((total, g) => total + g.members, 0);
  const vistos = new Set<string>();
  let linhas = 0;
  let estimadas = false;
  for (const g of grupos) {
    const lids = lidos.get(g.whatsappGroupId);
    if (!lids) {
      estimadas = true;
      continue;
    }
    linhas += lids.size;
    for (const lid of lids) vistos.add(lid);
  }
  return { pessoas: soma - (linhas - vistos.size), estimadas };
}
