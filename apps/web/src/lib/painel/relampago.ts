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
 * Há quanto tempo a oferta está no ar. `null` quando não há `opened_at` — sem
 * abertura registrada não se inventa um cronômetro parado em 0:00.
 */
export function noArHa(openedAt: string | null | undefined, agora: Date): string | null {
  if (!openedAt) return null;
  const abriu = new Date(openedAt).getTime();
  if (Number.isNaN(abriu)) return null;
  // Relógio do navegador adiantado daria tempo negativo; relogio() pisa em 0:00.
  return relogio((agora.getTime() - abriu) / 1000);
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

/** "NOVO KIT · 5 peças" — nome em caixa alta na etiqueta, contagem ao lado. */
export function etiquetaDaOferta(nome: string, pecas: number): string {
  const limpo = nome.trim() || "Oferta";
  return `${limpo} · ${pecas} ${pecas === 1 ? "peça" : "peças"}`;
}
