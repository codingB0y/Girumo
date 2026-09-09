/**
 * Regras puras da tela de Páginas na Vitrine Aberta (seção 9.1 da spec
 * 2026-09-07-painel-vitrine-aberta-telas.md: a página é etiqueta de peça,
 * como a campanha e a oferta).
 *
 * O que a campanha resolve com vagas, a página resolve com conversão: é o
 * número que diz se ela está rendendo. E, ao contrário da campanha, a página
 * TEM sinal de tempo real — `status === "published"` — então é ela quem usa
 * o Acid de AO VIVO.
 */

import type { LpStatus } from "@/lib/pages/schema";
import type { Carga } from "@/lib/painel/types";
import type { ChipDeEstado } from "@/lib/painel/campanhas";

/** A forma mínima que a etiqueta lê de uma landing page. */
export type PaginaNaEtiqueta = {
  id: string;
  slug: string;
  status: LpStatus;
  views_count: number;
  leads_count: number;
  content: { store_name: string };
};

/**
 * A cena da lista.
 *
 * Não tem "sem-resultado" porque a tela não filtra nem busca. O erro de
 * DUPLICAÇÃO não entra aqui de propósito: ele é um aviso que convive com a
 * lista já carregada — sumir com as páginas porque uma cópia falhou seria
 * perder o trabalho de vista por causa de um botão.
 */
export type CenaDasPaginas = "carregando" | "erro" | "vazio" | "lista";

export function cenaDasPaginas(input: { carga: Carga; total: number }): CenaDasPaginas {
  if (input.carga === "carregando") return "carregando";
  if (input.carga === "erro") return "erro";
  if (input.total === 0) return "vazio";
  return "lista";
}

/**
 * O estado da página como chip. "No ar" é o único Acid da tela — e aqui ele
 * tem lastro: `published` é o estado que faz a página responder no /p/.
 */
export function chipDaPagina(status: LpStatus): ChipDeEstado {
  if (status === "published") return { texto: "No ar", tom: "acid" };
  if (status === "paused") return { texto: "Pausada", tom: "line" };
  return { texto: "Rascunho", tom: "line" };
}

/**
 * A linha de rendimento da etiqueta.
 *
 * Página sem visita não converteu 0% — não teve chance. Mostrar "0%" a quem
 * publicou hoje de manhã acusa de fracasso quem só está esperando o primeiro
 * visitante, e é a mesma família de erro do "0 / 0 vagas" da campanha.
 */
export type LinhaDeConversao =
  | { tipo: "conversao"; texto: string; porcentagem: string; taxa: number }
  | { tipo: "sem-visitas"; texto: string };

export function linhaDeConversao(pagina: PaginaNaEtiqueta): LinhaDeConversao {
  const pt = (n: number) => n.toLocaleString("pt-BR");
  const leads = Math.max(0, pagina.leads_count);
  const visitas = Math.max(0, pagina.views_count);
  const plural = leads === 1 ? "lead" : "leads";

  if (visitas === 0) {
    return {
      tipo: "sem-visitas",
      texto: leads > 0 ? `${pt(leads)} ${plural} · sem visita registrada` : "Nenhuma visita ainda",
    };
  }

  return {
    tipo: "conversao",
    texto: `${pt(leads)} ${plural} em ${pt(visitas)} ${visitas === 1 ? "visita" : "visitas"}`,
    porcentagem: `${Math.round((leads / visitas) * 100)}%`,
    // Lead pode chegar sem visita contada; a barra para no trilho cheio.
    taxa: Math.min(1, Math.max(leads / visitas, 0.02)),
  };
}

/** O caminho curto que a etiqueta mostra no lugar da URL: "/p/oferta". */
export function caminhoDaPagina(slug: string): string {
  return `/p/${slug}`;
}

/** O link inteiro, que só o botão Copiar carrega (regra 5 da spec). */
export function linkDaPagina(origin: string, slug: string): string | null {
  if (!origin || !slug) return null;
  return `${origin}/p/${slug}`;
}

/**
 * O que mais rende em cima. Empate de leads cai nas visitas, e depois no
 * nome, para a ordem não depender da ordem em que a API devolveu.
 *
 * Devolve array novo: ordenar in-place o array do `useState` faz o React
 * comparar a mesma referência e pular o render.
 */
export function ordenarPaginas<T extends PaginaNaEtiqueta>(paginas: readonly T[]): T[] {
  return [...paginas].sort(
    (a, b) =>
      b.leads_count - a.leads_count ||
      b.views_count - a.views_count ||
      a.content.store_name.localeCompare(b.content.store_name, "pt-BR"),
  );
}

/**
 * O estado de cada botão "Duplicar".
 *
 * Uma duplicação em curso trava TODOS os botões, não só o clicado: a cópia
 * termina navegando para a página nova, e dois cliques em cartões diferentes
 * disputariam para onde ir. O spinner, esse sim, fica só em quem foi clicado.
 */
export function estadoDoDuplicar(
  idDaPagina: string,
  duplicando: string | null,
): { ocupado: boolean; desabilitado: boolean; texto: string } {
  const ocupado = duplicando === idDaPagina;
  return {
    ocupado,
    desabilitado: duplicando !== null,
    texto: ocupado ? "Duplicando..." : "Duplicar",
  };
}
