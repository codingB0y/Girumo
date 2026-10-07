/**
 * Regras puras da Oferta Relâmpago da Vitrine Aberta (cena 5 da seção 11 da
 * spec 2026-09-07-painel-vitrine-aberta-telas.md).
 *
 * A cena pede um chip "AO VIVO · fecha em 4:12". Não existe prazo de fechamento
 * de oferta no domínio: `timer_seconds` é o prazo POR CLIENTE (a reserva), e a
 * oferta fecha quando as peças acabam ou quando a lojista fecha. O relógio real
 * que corre é o tempo no ar, contado de `opened_at` — é ele que a tela mostra.
 */

import { horaSegundoBR } from "@/lib/date-br";

export type OfertaLike = {
  slots: number;
  status: "draft" | "open" | "closed";
  opened_at?: string | null;
};

export type EntradaLike = {
  outcome: "sold" | "dropped" | null;
  claim: unknown | null;
};

/** "1ª", "2ª", "13ª" — a posição na fila como a lojista fala. */
export function ordinal(indice: number): string {
  return `${indice + 1}ª`;
}

/**
 * "12:03:41". Na fila o segundo é o que separa a 1ª da 2ª: duas pessoas
 * comentam no mesmo minuto e a ordem precisa ficar visível.
 *
 * O fuso é o de Brasília, decidido uma vez em `date-br.ts`: sem ele o horário
 * segue o relógio de quem abre a tela, e no CI (UTC) já saiu três horas fora.
 */
export function horarioComSegundos(iso: string): string {
  return horaSegundoBR(iso);
}

/** "4:12" a partir de segundos; passa de uma hora vira "1:04:12". */
export function relogio(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const mm = Math.floor(s / 60) % 60;
  const ss = s % 60;
  const hh = Math.floor(s / 3600);
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${doisDigitos(mm)}:${doisDigitos(ss)}` : `${mm}:${doisDigitos(ss)}`;
}

/**
 * Há quanto tempo a oferta está no ar, em palavras ("agora", "12 min", "2 h 10 min", "3 dias"):
 * oferta aberta há dias não vira "270:05:19". `null` quando não há `opened_at` — sem abertura
 * registrada não se inventa um cronômetro. O relógio de contagem regressiva é `relogio()`.
 */
export function noArHa(openedAt: string | null | undefined, agora: Date): string | null {
  if (!openedAt) return null;
  const abriu = new Date(openedAt).getTime();
  if (Number.isNaN(abriu)) return null;
  // Relógio do navegador adiantado daria idade negativa: vale "agora".
  const minutos = Math.max(0, Math.floor((agora.getTime() - abriu) / 60_000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }
  const dias = Math.floor(minutos / (24 * 60));
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** "no ar há 2 h 10 min", ou "no ar agora" (nunca "no ar há agora"). */
export function fraseNoAr(tempo: string): string {
  return tempo === "agora" ? "no ar agora" : `no ar há ${tempo}`;
}

export type ResumoDaOferta = {
  pecas: number;
  vendidas: number;
  reservadas: number;
  /** Peças que ainda dá pra reservar; nunca negativo. */
  livres: number;
  naFila: number;
};

/** O estoque da oferta em um número só por coluna, para a etiqueta e o botão. */
export function resumoDaOferta(oferta: OfertaLike, fila: readonly EntradaLike[]): ResumoDaOferta {
  const pecas = Math.max(0, oferta.slots ?? 0);
  const vendidas = fila.filter((e) => e.outcome === "sold").length;
  const reservadas = fila.filter((e) => e.claim && !e.outcome).length;
  return {
    pecas,
    vendidas,
    reservadas,
    livres: Math.max(0, pecas - (vendidas + reservadas)),
    naFila: fila.length,
  };
}

export type PlacarDaOferta = { pediram: number; atendidas: number; vendeu: number; esperando: number };

const estaEsperando = (e: EntradaLike) => !e.claim && !e.outcome;

/** O placar da oferta no ar: quem pediu, quem já foi atendida, quem comprou, quem espera. */
export function placarDaOferta(fila: readonly EntradaLike[]): PlacarDaOferta {
  const esperando = fila.filter(estaEsperando).length;
  return {
    pediram: fila.length,
    atendidas: fila.length - esperando,
    vendeu: fila.filter((e) => e.outcome === "sold").length,
    esperando,
  };
}

/** A próxima a ser atendida: a primeira, na ordem da fila, sem reserva e sem desfecho. */
export function proximaDaFila<T extends EntradaLike>(fila: readonly T[]): T | null {
  return fila.find(estaEsperando) ?? null;
}

export type JanelaDaFila<T> = {
  linhas: { entrada: T; posicao: number }[];
  /** Vendidas que ficaram antes da janela. */
  vendidasAntes: number;
  /** Esperando (sem reserva e sem desfecho) que ficaram depois da janela. */
  maisEsperando: number;
};

/**
 * As linhas da fila em volta da posição atual (spec G2, decisão 9): uma linha já resolvida para dar
 * contexto e, da primeira ainda em aberto em diante, as próximas. `posicao` é o índice na fila inteira
 * (o ordinal que a tela mostra). O que ficou fora vai para `linhaDaFila`.
 */
export function janelaDaFila<T extends EntradaLike>(fila: readonly T[], linhas: number): JanelaDaFila<T> {
  const primeiraAberta = fila.findIndex((e) => !e.outcome);
  const inicio = Math.max(0, (primeiraAberta === -1 ? fila.length : primeiraAberta) - 1);
  const dentro = fila.slice(inicio, inicio + linhas).map((entrada, i) => ({ entrada, posicao: inicio + i }));
  return {
    linhas: dentro,
    vendidasAntes: fila.slice(0, inicio).filter((e) => e.outcome === "sold").length,
    maisEsperando: fila.slice(inicio + dentro.length).filter(estaEsperando).length,
  };
}

/** "4 vendidas antes · mais 5 esperando"; null quando a janela mostra a fila inteira. */
export function linhaDaFila(j: { vendidasAntes: number; maisEsperando: number }): string | null {
  const partes = [
    j.vendidasAntes > 0 ? `${j.vendidasAntes} ${j.vendidasAntes === 1 ? "vendida" : "vendidas"} antes` : null,
    j.maisEsperando > 0 ? `mais ${j.maisEsperando} esperando` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** Peças que ainda não foram vendidas; reserva em andamento ainda não tirou a peça. */
export function pecasRestantes(
  oferta: OfertaLike,
  fila: readonly EntradaLike[],
): { restantes: number; pecas: number } {
  const pecas = Math.max(0, oferta.slots ?? 0);
  const vendidas = fila.filter((e) => e.outcome === "sold").length;
  return { restantes: Math.max(0, pecas - vendidas), pecas };
}

/** "NOVO KIT · 5 peças" — nome em caixa alta na etiqueta, contagem ao lado. */
export function etiquetaDaOferta(nome: string, pecas: number): string {
  const limpo = nome.trim() || "Oferta";
  return `${limpo} · ${pecas} ${pecas === 1 ? "peça" : "peças"}`;
}

/** "em 3 grupos: VIP 1, VIP 2 e mais 1" — até 2 nomes; o que não acha nome fica só na contagem. */
export function fraseDosGrupos(
  groupIds: readonly string[],
  grupos: ReadonlyArray<{ whatsappGroupId: string; name: string }>,
): string {
  const n = groupIds.length;
  if (n === 0) return "sem grupo aberto";
  const nomes = groupIds
    .map((id) => grupos.find((g) => g.whatsappGroupId === id)?.name)
    .filter((nome): nome is string => !!nome);
  const base = `em ${n} ${n === 1 ? "grupo" : "grupos"}`;
  if (nomes.length === 0) return base;
  const resto = n - 2;
  return `${base}: ${nomes.slice(0, 2).join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}`;
}

/**
 * Por que "Pegar a próxima" está desligado, na ordem em que a vendedora precisa saber;
 * `null` = pode pegar. "Acabaram" só quando as peças foram vendidas: reserva de outra
 * vendedora ainda pode voltar para a fila, e dizer "acabaram" seria falso.
 */
export function motivoDoBotao(
  oferta: OfertaLike,
  fila: readonly EntradaLike[],
  temConversaNaMao: boolean,
): string | null {
  if (temConversaNaMao) return "termine a conversa atual antes";
  if (pecasRestantes(oferta, fila).restantes <= 0) return "as peças acabaram";
  if (resumoDaOferta(oferta, fila).livres <= 0) return "todas as peças estão reservadas";
  if (!proximaDaFila(fila)) return "ninguém esperando";
  return null;
}
