/**
 * Tokens da direção "impacto" (Páginas v3): fundo escuro neutro, um acento só
 * (a cor da marca), tipografia display pesada. Superfície fixa garante contraste
 * por construção; a marca entra por CSS vars derivadas com contraste acessível
 * SOBRE o fundo escuro (`deriveDarkPalette`), não sobre papel.
 *
 * Os campos do formulário e o CTA fixo leem `--lp-field-*` / `--lp-sticky-bg`
 * com fallback nos valores da editorial v2 — então esta direção pinta os campos
 * sem tocar no que a v2 mostra.
 */

import type { CSSProperties } from "react";
import type { AccessiblePalette } from "@/lib/pages/palette";

export const IMPACTO = {
  bg: "#0f1418",
  surface: "#161d25",
  surface2: "#1d2731",
  ink: "#f5f7f8",
  muted: "#aeb8c2",
  line: "rgba(255,255,255,0.10)",
} as const;

export function impactoStyle(palette: AccessiblePalette): CSSProperties {
  return {
    "--lp-bg": IMPACTO.bg,
    "--lp-surface": IMPACTO.surface,
    "--lp-surface-2": IMPACTO.surface2,
    "--lp-ink": IMPACTO.ink,
    "--lp-muted": IMPACTO.muted,
    "--lp-line": IMPACTO.line,
    "--lp-brand": palette.brand,
    "--lp-on-brand": palette.onBrand,
    "--lp-accent": palette.accent,
    "--lp-brand-soft": `${palette.brand}26`, // ~15%
    "--lp-brand-glow": `${palette.brand}59`, // ~35%, luz atrás da foto
    "--lp-field-bg": "rgba(255,255,255,0.06)",
    "--lp-field-border": "rgba(255,255,255,0.18)",
    "--lp-field-ink": IMPACTO.ink,
    "--lp-field-placeholder": "#8593a0",
    "--lp-sticky-bg": "rgba(15,20,24,0.94)",
  } as CSSProperties;
}

/**
 * Escala tipográfica. Strings literais pro Tailwind compilar. Display em
 * `--lp-font-display` (Bricolage Grotesque, carregada pela estrutura); corpo
 * herda a Plex Sans do layout raiz; meta em mono (etiqueta).
 */
export const T = {
  eyebrow: "font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--lp-accent)]",
  display:
    "[font-family:var(--lp-font-display)] text-[2.35rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-[color:var(--lp-ink)] sm:text-[3.1rem] lg:text-[3.9rem]",
  h2: "[font-family:var(--lp-font-display)] text-[1.75rem] font-bold leading-[1.08] tracking-[-0.025em] text-[color:var(--lp-ink)] lg:text-[2.4rem]",
  h3: "[font-family:var(--lp-font-display)] text-[1.15rem] font-bold leading-snug tracking-[-0.01em] text-[color:var(--lp-ink)]",
  lead: "text-[1.05rem] leading-relaxed text-[color:var(--lp-muted)] lg:text-lg",
  body: "text-[0.95rem] leading-relaxed text-[color:var(--lp-muted)]",
  meta: "font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--lp-muted)]",
  number:
    "[font-family:var(--lp-font-display)] text-[2.6rem] font-extrabold leading-none tracking-[-0.04em] text-[color:var(--lp-accent)] tabular-nums lg:text-[3.4rem]",
} as const;

/** Container e ritmo vertical comuns a todas as seções. */
export const WRAP = "mx-auto w-full max-w-md px-6 lg:max-w-6xl lg:px-10";
export const SECTION = "py-14 lg:py-24";
