// apps/web/src/components/painel/configuracoes/bling-painel-estilo.ts
import type { Tom } from "./bling-painel-texto";

/**
 * Classes do cartão do Bling: as mesmas do Site próprio (`site-proprio-painel.tsx`, que não
 * as exporta), para a porta Integrações ter um desenho só (spec 2026-10-13 §6). Os três
 * arquivos do painel do Bling leem daqui.
 */

export const CARTAO = "pn-card rounded-[var(--radius-control)] p-6 lg:p-8";
export const TITULO = "text-15 font-semibold text-volt-950";
export const AJUDA = "mt-1 text-13 text-slate-600";
/** Bloco abaixo do anterior, com o fio do mockup no meio. */
export const BLOCO = "mt-5 border-t border-line-200 pt-5";
export const ANEL = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
export const PRIMARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800 disabled:cursor-not-allowed disabled:bg-volt-950/30";
export const SECUNDARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 disabled:cursor-not-allowed disabled:opacity-60";
export const COR_DO_TOM: Record<Tom, string> = {
  ok: "text-success-700",
  alerta: "text-warning-700",
  erro: "text-danger-700",
  neutro: "text-slate-600",
};
/** Borda de campo com 3:1 sobre o papel (o fio `line-200` sozinho some). */
export const CAMPO =
  "min-h-11 rounded-[var(--radius-control)] border border-slate-600/70 bg-paper-0 px-3 text-[14px] text-volt-950";
