/**
 * Regras puras da tela de Campanhas na Vitrine Aberta (seção 9.1 da spec
 * 2026-09-07-painel-vitrine-aberta-telas.md: campanha é etiqueta de peça).
 *
 * O cálculo pesado — quais grupos, quantos membros, qual a lotação — já mora
 * em `campaign-groups-overview.ts` e não é reescrito aqui. Este arquivo cuida
 * do que a etiqueta pede: a cena, a ordem, o chip e as linhas de texto.
 */

import type { CampaignOperationalStatus } from "@/lib/campaign-groups-overview";
import type { Carga } from "@/lib/painel/types";

/** A forma mínima que a etiqueta lê de um overview de campanha. */
export type CampanhaNaEtiqueta = {
  campaign: { id: string; name: string; slug?: string };
  totalMembers: number;
  totalCapacity: number;
  fillPct: number;
  groupCount: number;
  clicks: number;
  operationalStatus: CampaignOperationalStatus;
};

export type FiltroDeCampanha = "all" | CampaignOperationalStatus;

/**
 * A cena da tela.
 *
 * "vazio" (nunca criou nenhuma) e "sem-resultado" (o filtro não achou) são
 * cenas distintas de propósito: a casca antiga só oferecia o botão "Nova
 * campanha" na primeira, e oferecê-lo na segunda mandaria criar campanha a
 * quem só digitou errado na busca.
 */
export type CenaDasCampanhas = "carregando" | "erro" | "vazio" | "sem-resultado" | "lista";

export function cenaDasCampanhas(input: {
  carga: Carga;
  total: number;
  visiveis: number;
}): CenaDasCampanhas {
  if (input.carga === "carregando") return "carregando";
  if (input.carga === "erro") return "erro";
  if (input.total === 0) return "vazio";
  if (input.visiveis === 0) return "sem-resultado";
  return "lista";
}

/** Tons de chip que o CSS conhece: `pn-chip`, `pn-chip--acid`, `pn-chip--line`. */
export type TomDeChip = "canvas" | "acid" | "line";

export type ChipDeEstado = { texto: string; tom: TomDeChip };

/**
 * O estado da campanha como chip.
 *
 * A spec fala em PRONTA / AO VIVO / LOTOU. "AO VIVO" fica de fora aqui de
 * propósito: campanha não tem sinal de tempo real no domínio — `clicks` é
 * acumulado desde sempre, e chamar de "ao vivo" uma campanha cujo último
 * clique foi em março seria inventar movimento que não existe. A página, que
 * tem `status === "published"`, é quem ganha o Acid de AO VIVO.
 *
 * Os dois estados de problema (`needs_invites`, `empty`) continuam visíveis:
 * são a diferença entre uma campanha que trabalha e uma que só parece pronta.
 */
export function chipDaCampanha(status: CampaignOperationalStatus): ChipDeEstado {
  if (status === "full") return { texto: "Lotou", tom: "acid" };
  if (status === "ready") return { texto: "Pronta", tom: "canvas" };
  if (status === "needs_invites") return { texto: "Sem convite", tom: "line" };
  return { texto: "Sem grupos", tom: "line" };
}

/** A partir daqui a barra vira Atenção: a campanha está prestes a lotar. */
export const LIMIAR_QUASE_LOTADA = 85;

export function quaseLotada(fillPct: number): boolean {
  return fillPct >= LIMIAR_QUASE_LOTADA;
}

/**
 * A linha de vagas da etiqueta.
 *
 * Quatro saídas, porque quatro situações — e cada fusão entre elas já custou
 * um PR nesta série: os grupos ainda estão vindo, a consulta deles falhou, a
 * campanha não tem grupo nenhum, ou há vaga a mostrar. Sem a separação, uma
 * falha em `/api/groups` vira "0 / 0 vagas" (número inventado com cara de
 * medição) e um carregamento normal vira "indisponível" (erro sem erro).
 */
export type LinhaDeVagas =
  | { tipo: "vagas"; texto: string; porcentagem: string; lotacao: number; quase: boolean }
  | { tipo: "sem-grupos" }
  | { tipo: "sem-contagem"; grupos: number }
  | { tipo: "carregando" }
  | { tipo: "indisponivel" };

export function linhaDeVagas(campanha: CampanhaNaEtiqueta, cargaDosGrupos: Carga): LinhaDeVagas {
  if (cargaDosGrupos === "carregando") return { tipo: "carregando" };
  if (cargaDosGrupos === "erro") return { tipo: "indisponivel" };
  // Quem decide "sem grupos" é a contagem de grupos, NÃO a capacidade. Uma
  // campanha pode apontar para grupos que sumiram de /api/groups (id órfão):
  // a capacidade soma zero, mas os grupos foram escolhidos. Dizer "nenhum
  // grupo escolhido" ali manda a lojista escolher grupos que ela já escolheu.
  if (campanha.groupCount === 0) return { tipo: "sem-grupos" };
  if (campanha.totalCapacity <= 0) return { tipo: "sem-contagem", grupos: campanha.groupCount };

  const pt = (n: number) => n.toLocaleString("pt-BR");
  return {
    tipo: "vagas",
    texto: `${pt(campanha.totalMembers)} / ${pt(campanha.totalCapacity)} vagas`,
    porcentagem: `${campanha.fillPct}%`,
    // O piso de 2% é desenho: barra zerada some, e a campanha vazia deixa de
    // parecer uma campanha.
    lotacao: Math.min(1, Math.max(campanha.fillPct / 100, 0.02)),
    quase: quaseLotada(campanha.fillPct),
  };
}

/** "1 clique" / "12 cliques"; `null` quando a consulta de links não respondeu. */
export function textoDeCliques(cliques: number, cargaDosLinks: Carga): string | null {
  if (cargaDosLinks !== "ok") return null;
  return `${cliques.toLocaleString("pt-BR")} ${cliques === 1 ? "clique" : "cliques"}`;
}

/**
 * O link público da campanha, inteiro.
 *
 * Fica fora da lista por decisão de desenho (regra 5 da spec: a URL inteira
 * nunca aparece na lista, só o botão Copiar leva ela). `null` enquanto o slug
 * não existe — a campanha acabou de nascer e o link está sendo gerado.
 */
export function linkPublico(origin: string, slug: string | undefined): string | null {
  if (!slug || !origin) return null;
  return `${origin}/r/${slug}`;
}

/** O caminho curto que a etiqueta mostra no lugar da URL: "/r/reativacao". */
export function caminhoPublico(slug: string | undefined): string | null {
  return slug ? `/r/${slug}` : null;
}

/** Sem acento e sem caixa: buscar "reativacao" tem que achar "Reativação". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filtrarCampanhas<T extends CampanhaNaEtiqueta>(
  campanhas: readonly T[],
  filtro: FiltroDeCampanha,
  busca: string,
): T[] {
  const alvo = normalizar(busca);
  return campanhas.filter(
    (c) =>
      (filtro === "all" || c.operationalStatus === filtro) &&
      (alvo === "" || normalizar(c.campaign.name).includes(alvo)),
  );
}

/**
 * Maior lotação em cima (regra da seção 9.1). Empate resolvido pelo nome, para
 * que a ordem não dependa da ordem em que a API devolveu.
 *
 * Devolve array novo: ordenar a lista que veio do `useState` in-place faria o
 * React comparar o array consigo mesmo e pular o render.
 */
export function ordenarPorLotacao<T extends CampanhaNaEtiqueta>(campanhas: readonly T[]): T[] {
  return [...campanhas].sort(
    (a, b) => b.fillPct - a.fillPct || a.campaign.name.localeCompare(b.campaign.name, "pt-BR"),
  );
}

/** Quantas campanhas cada filtro mostraria — o número ao lado de cada aba. */
export function contarPorFiltro(
  campanhas: readonly CampanhaNaEtiqueta[],
): Record<FiltroDeCampanha, number> {
  const contas: Record<FiltroDeCampanha, number> = {
    all: campanhas.length,
    ready: 0,
    needs_invites: 0,
    full: 0,
    empty: 0,
  };
  for (const c of campanhas) contas[c.operationalStatus] += 1;
  return contas;
}
