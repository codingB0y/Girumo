/**
 * Regras puras da tela de Automações na Vitrine Aberta.
 *
 * A automação é uma peça com interruptor: o estado ligado/desligado é o que a
 * lojista lê primeiro, e o resumo do gatilho vem embaixo. O que mora aqui é a
 * decisão — quem aparece, o que a linha diz e como a lista volta ao lugar
 * quando a API recusa uma ação otimista.
 */

import type { Carga } from "@/lib/painel/types";

/**
 * Gatilhos de lifecycle do SaaS. Vivem em `lib/email` + cron e **nunca**
 * aparecem na tela do lojista — decisão P0.7. `TRIGGER_LABELS` também não os
 * carrega, então um vazamento aqui não mostra só um item a mais: mostra o slug
 * cru ("trial_ending") na cara de quem paga.
 */
export const GATILHOS_DO_SAAS = ["no_connect_24h", "trial_ending"] as const;

const DO_SAAS: ReadonlySet<string> = new Set(GATILHOS_DO_SAAS);

export function visiveisParaOLojista<T extends { trigger: string }>(lista: readonly T[]): T[] {
  return lista.filter((a) => !DO_SAAS.has(a.trigger));
}

export type CenaDasAutomacoes = "carregando" | "erro" | "vazio" | "lista";

export function cenaDasAutomacoes(input: { carga: Carga; total: number }): CenaDasAutomacoes {
  if (input.carga === "carregando") return "carregando";
  if (input.carga === "erro") return "erro";
  if (input.total === 0) return "vazio";
  return "lista";
}

/** "Imediato" · "5 min" · "2 h" · "3 dias". */
export function esperaEmPalavras(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m === 0) return "Imediato";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  const dias = Math.round(m / 1440);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** "Grupo lotou · 2 passos · 12 execuções" — a linha embaixo do nome. */
export function resumoDaAutomacao(
  automacao: { steps: readonly unknown[]; total_runs: number },
  rotuloDoGatilho: string,
): string {
  const passos = automacao.steps.length;
  const execucoes = Math.max(0, automacao.total_runs);
  return [
    rotuloDoGatilho,
    `${passos} ${passos === 1 ? "passo" : "passos"}`,
    `${execucoes.toLocaleString("pt-BR")} ${execucoes === 1 ? "execução" : "execuções"}`,
  ].join(" · ");
}

/** O passo como chip: mensagem tem nome, espera tem duração. */
export function chipDoPasso(passo: { type: string; delay_minutes: number }): {
  texto: string;
  mensagem: boolean;
} {
  if (passo.type === "message") return { texto: "Mensagem", mensagem: true };
  return { texto: esperaEmPalavras(passo.delay_minutes), mensagem: false };
}

/**
 * Troca `enabled` de UMA automação.
 *
 * Devolve lista nova sem tocar nas outras linhas: reverter com um retrato
 * inteiro engoliria a alternância que a lojista fez em outra linha enquanto
 * esta estava em voo.
 */
export function comEnabled<T extends { id: string; enabled: boolean }>(
  lista: readonly T[],
  id: string,
  enabled: boolean,
): T[] {
  return lista.map((a) => (a.id === id ? { ...a, enabled } : a));
}

/**
 * Devolve a automação removida ao lugar dela, quando a API recusa o DELETE.
 *
 * Se ela já voltou (outra carga chegou no meio), devolve a MESMA referência —
 * inserir de novo criaria linha duplicada, e devolver cópia faria o React
 * re-renderizar a lista inteira à toa.
 */
export function reinserirNaPosicao<T extends { id: string }>(
  lista: readonly T[],
  item: T,
  indice: number,
): readonly T[] {
  if (lista.some((a) => a.id === item.id)) return lista;
  const proxima = [...lista];
  proxima.splice(Math.min(Math.max(0, indice), proxima.length), 0, item);
  return proxima;
}
