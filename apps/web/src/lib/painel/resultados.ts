/**
 * Regras puras da tela de Resultados na Vitrine Aberta.
 *
 * A tela puxa CINCO rotas e mostra dinheiro. É o pior lugar da série para
 * confundir "não sei" com "zero": um `.catch(() => [])` em /api/orders
 * imprimia **R$ 0,00** em "Vendas desde o início" — número inventado, com
 * cara de fechamento de caixa. Por isso todo número desta tela nasce podendo
 * ser `null`, e quem não respondeu mostra travessão em vez de zero.
 */

import { vagasDaCampanha, type GrupoResumo } from "@/lib/painel/inicio";
import type { Carga } from "@/lib/painel/types";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type PedidoLike = { value?: number | null; group_name?: string | null; campaign_id?: string | null };
export type CampanhaLike = { id: string; name: string; groupIds: string[] };

/**
 * A cena do quadro inteiro, a partir das cinco cargas.
 *
 * Só é esqueleto enquanto NADA voltou, e só é erro quando NADA deu certo. No
 * meio-termo o quadro aparece com os números que chegaram e travessão nos
 * outros — melhor do que segurar cinco medições reféns da mais lenta.
 */
export function cenaDosResultados(cargas: readonly Carga[]): "carregando" | "erro" | "quadro" {
  if (cargas.length === 0) return "carregando";
  if (cargas.every((c) => c === "carregando")) return "carregando";
  if (cargas.every((c) => c === "erro")) return "erro";
  return "quadro";
}

/** Alguma consulta falhou? O quadro sai, mas com aviso — e sem fingir zero. */
export function houveFalha(cargas: readonly Carga[]): boolean {
  return cargas.some((c) => c === "erro");
}

/** O número do quadro, ou `null` quando a consulta que o produz não respondeu. */
export function numeroOuNada(valor: number, carga: Carga): string | null {
  if (carga !== "ok") return null;
  return valor.toLocaleString("pt-BR");
}

/** Idem, em reais. Dinheiro é onde o zero inventado dói mais. */
export function dinheiroOuNada(valor: number, carga: Carga): string | null {
  if (carga !== "ok") return null;
  return BRL.format(valor);
}

/**
 * Conversão clique → entrada.
 *
 * Sem clique não existe taxa: dividir por zero e imprimir "0%" acusa de
 * fracasso quem ainda não teve visitante. `null` vira travessão na tela.
 */
export function conversaoCliqueEntrada(entradas: number, cliques: number, carga: Carga): string | null {
  if (carga !== "ok" || cliques <= 0) return null;
  return `${Math.round((entradas / cliques) * 100)}%`;
}

export type PassoDoFunil = {
  rotulo: string;
  valor: number;
  /** 0..1 para a barra; piso de 4% pra o passo vazio não sumir do desenho. */
  largura: number;
  /** "38% do passo", ou `null` no primeiro passo e quando o anterior é zero. */
  doPassoAnterior: string | null;
};

/**
 * O caminho até a venda, medido sempre contra os cliques — que é o topo.
 *
 * A casca antiga fixava 100% no primeiro passo. Com zero clique aquilo
 * desenhava uma barra cheia embaixo de um zero.
 */
export function funilDaVenda(input: { cliques: number; entradas: number; pedidos: number }): PassoDoFunil[] {
  const passos = [
    { rotulo: "Clicaram no link", valor: Math.max(0, input.cliques) },
    { rotulo: "Entraram no grupo", valor: Math.max(0, input.entradas) },
    { rotulo: "Viraram pedidos", valor: Math.max(0, input.pedidos) },
  ];
  const topo = passos[0].valor;

  return passos.map((passo, i) => {
    const anterior = i > 0 ? passos[i - 1].valor : null;
    return {
      ...passo,
      largura: topo > 0 ? Math.min(1, Math.max(passo.valor / topo, 0.04)) : 0.04,
      doPassoAnterior:
        anterior && anterior > 0 ? `${Math.round((passo.valor / anterior) * 100)}% do passo` : null,
    };
  });
}

export type FatiaDoTotal = { nome: string; total: number; largura: number };

/** Ordena do maior para o menor e mede cada barra contra o primeiro lugar. */
function ranquear(linhas: { nome: string; total: number }[]): FatiaDoTotal[] {
  // Empate resolvido pelo nome: sem isso a ordem depende de como o Map iterou.
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  const maior = linhas[0]?.total ?? 0;
  return linhas.map((l) => ({
    ...l,
    largura: maior > 0 ? Math.min(1, Math.max(l.total / maior, 0.02)) : 0.02,
  }));
}

function somar(pedidos: readonly PedidoLike[], chave: (p: PedidoLike) => string): FatiaDoTotal[] {
  const soma = new Map<string, number>();
  for (const pedido of pedidos) {
    const nome = chave(pedido);
    soma.set(nome, (soma.get(nome) ?? 0) + (pedido.value ?? 0));
  }
  return ranquear([...soma.entries()].map(([nome, total]) => ({ nome, total })));
}

/** Quanto cada grupo vendeu. Pedido sem grupo vira "Sem grupo", não some. */
export function vendasPorGrupo(pedidos: readonly PedidoLike[]): FatiaDoTotal[] {
  return somar(pedidos, (p) => p.group_name?.trim() || "Sem grupo");
}

/**
 * Quanto cada campanha vendeu. Casa por ID, nunca por nome — renomear a
 * campanha não pode zerar o histórico dela (mesma regra de
 * `links/click-attribution.ts`). Pedido órfão vira "Sem origem".
 */
export function vendasPorCampanha(
  pedidos: readonly PedidoLike[],
  campanhas: readonly CampanhaLike[],
): FatiaDoTotal[] {
  const nomePorId = new Map(campanhas.map((c) => [c.id, c.name]));
  return somar(pedidos, (p) => (p.campaign_id && nomePorId.get(p.campaign_id)) || "Sem origem");
}

/**
 * As campanhas que mais juntaram gente. Reusa `vagasDaCampanha` porque casar
 * `groupIds` com grupo tem uma sutileza que não vale duplicar: em produção o
 * id guardado é o do WhatsApp, não o UUID.
 */
export function membrosPorCampanha(
  campanhas: readonly CampanhaLike[],
  grupos: readonly GrupoResumo[],
  limite = 5,
): FatiaDoTotal[] {
  const linhas = campanhas.map((c) => ({
    nome: c.name,
    total: vagasDaCampanha(c.groupIds, grupos).pessoas,
  }));
  return ranquear(linhas).slice(0, limite);
}
