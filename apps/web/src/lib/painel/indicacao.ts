/**
 * Regras puras da tela de Indicação na Vitrine Aberta.
 *
 * A indicadora é PESSOA, então a peça dela é a ficha (`pn-ficha`), não a
 * etiqueta de preço. E a métrica é **clique**, nunca "entrada": a entrada
 * acontece dentro do WhatsApp e não volta identificada — a área toda já foi
 * inerte uma vez por afirmar número que ninguém media.
 */

import type { Carga } from "@/lib/painel/types";

export type IndicadoraNaFicha = {
  id: string;
  referrerName: string;
  group: string;
  /** Caminho pronto vindo da API (`/r/<slug>`). Nunca montar isto na tela. */
  path: string;
  cliques: number;
  atingiu: boolean;
};

export type ConfigDoPrograma = { reward: string; goal: number };

export type CenaDoRanking = "carregando" | "erro" | "vazio" | "lista";

/**
 * A cena do ranking.
 *
 * O erro de APAGAR não entra aqui: ele é um aviso que convive com a lista.
 * Sumir com as indicadoras porque um DELETE falhou esconderia o trabalho todo
 * por causa de um botão.
 */
export function cenaDoRanking(input: { carga: Carga; total: number }): CenaDoRanking {
  if (input.carga === "carregando") return "carregando";
  if (input.carga === "erro") return "erro";
  if (input.total === 0) return "vazio";
  return "lista";
}

/** "Quem trouxer 3 cliques ganha frete grátis no próximo pedido". */
export function resumoDoPrograma(config: ConfigDoPrograma): string {
  const meta = Math.max(1, Math.floor(config.goal));
  const premio = config.reward.trim() || "a recompensa combinada";
  return `Quem trouxer ${meta} ${meta === 1 ? "clique" : "cliques"} ganha ${premio}`;
}

export type ProgressoDaIndicadora = {
  atingiu: boolean;
  /** Quantos cliques faltam. Nunca negativo — "faltam -2" não existe. */
  faltam: number;
  /** O que a ficha escreve à direita. */
  texto: string;
  /** 0..1 para a barra, com piso de 2% pra ficha nova não sumir. */
  proporcao: number;
};

export function progressoDaIndicadora(
  indicadora: Pick<IndicadoraNaFicha, "cliques">,
  goal: number,
): ProgressoDaIndicadora {
  const meta = Math.max(1, Math.floor(goal));
  const cliques = Math.max(0, indicadora.cliques);
  const atingiu = cliques >= meta;
  const faltam = Math.max(0, meta - cliques);
  return {
    atingiu,
    faltam,
    texto: atingiu ? "Bateu a meta" : `faltam ${faltam}`,
    proporcao: Math.min(1, Math.max(cliques / meta, 0.02)),
  };
}

/** "1 clique" / "12 cliques" — o número que a ficha carrega. */
export function textoDeCliques(cliques: number): string {
  const n = Math.max(0, cliques);
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? "clique" : "cliques"}`;
}

export function totaisDaIndicacao(ranking: readonly IndicadoraNaFicha[]): {
  pessoas: number;
  cliques: number;
  bateram: number;
} {
  return {
    pessoas: ranking.length,
    cliques: ranking.reduce((soma, r) => soma + Math.max(0, r.cliques), 0),
    bateram: ranking.filter((r) => r.atingiu).length,
  };
}

/**
 * Recalcula quem bateu a meta depois que a meta muda.
 *
 * Sem isto, baixar a meta de 5 para 2 deixava o selo "Bateu a meta" ausente em
 * quem já tinha 3 cliques — a tela mostrava a regra nova com o veredito velho.
 */
export function comMetaRecalculada<T extends { cliques: number; atingiu: boolean }>(
  ranking: readonly T[],
  goal: number,
): T[] {
  const meta = Math.max(1, Math.floor(goal));
  return ranking.map((r) => ({ ...r, atingiu: r.cliques >= meta }));
}

/**
 * Mais cliques em cima. Empate pelo nome, para a ordem não depender de como a
 * API devolveu — e devolve array novo, senão o React compara a mesma
 * referência e pula o render.
 */
export function ordenarRanking<T extends { cliques: number; referrerName: string }>(
  ranking: readonly T[],
): T[] {
  return [...ranking].sort(
    (a, b) => b.cliques - a.cliques || a.referrerName.localeCompare(b.referrerName, "pt-BR"),
  );
}

/** O link inteiro da indicadora, que só o botão Copiar carrega. */
export function linkDaIndicadora(origin: string, path: string): string | null {
  if (!origin || !path) return null;
  return `${origin}${path}`;
}

/**
 * A meta digitada, ou `null` quando não dá para usar.
 *
 * O input é `type="number"`, mas o valor chega como string e pode vir vazio,
 * com vírgula ou fora da faixa — `Number("")` é 0, e meta 0 faria toda
 * indicadora "bater a meta" na hora.
 */
export function metaValida(digitado: string): number | null {
  const n = Number(String(digitado).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const inteiro = Math.floor(n);
  if (inteiro < 1 || inteiro > 1000) return null;
  return inteiro;
}

/** O formulário só envia com os três campos preenchidos. */
export function podeCriarIndicadora(campos: {
  nome: string;
  grupo: string;
  inviteUrl: string;
}): boolean {
  return (
    campos.nome.trim().length > 0 &&
    campos.grupo.trim().length > 0 &&
    campos.inviteUrl.trim().length > 0
  );
}
