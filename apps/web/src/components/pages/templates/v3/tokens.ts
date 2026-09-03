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
import type { LpDirection } from "@/lib/pages/sections";

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
    // brilho de 1px no topo dos cartões e fundo das pílulas: luz sobre o escuro
    "--lp-glint": "rgba(255,255,255,0.06)",
    "--lp-chip": "rgba(255,255,255,0.04)",
    "--lp-display-weight": "800",
    "--lp-display-tracking": "-0.03em",
  } as CSSProperties;
}

/**
 * Tokens da direção "editorial" (Fase 2): a mesma superfície papel/tinta/vinho
 * da editorial v2, agora servida pelo motor de seções. Serifa no display com
 * peso médio e tracking mais solto — a composição vem das mesmas seções, só a
 * pele muda. A marca entra por `derivePalette` (contraste sobre o papel).
 */
export const EDITORIAL = {
  paper: "#efe9df",
  paperShade: "#e7dfd2",
  ink: "#221a13",
  inkSoft: "#6f6558",
  line: "#ddd2c2",
  wine: "#6d2436",
} as const;

export function editorialStyle(palette: AccessiblePalette): CSSProperties {
  return {
    "--lp-bg": EDITORIAL.paper,
    "--lp-surface": EDITORIAL.paperShade,
    "--lp-surface-2": "#ded4c4",
    "--lp-ink": EDITORIAL.ink,
    "--lp-muted": EDITORIAL.inkSoft,
    "--lp-line": EDITORIAL.line,
    "--lp-brand": palette.brand,
    "--lp-on-brand": palette.onBrand,
    "--lp-accent": palette.accent,
    "--lp-brand-soft": `${palette.brand}1a`, // ~10%, como na v2
    "--lp-brand-glow": `${palette.brand}26`, // luz discreta sobre o papel
    "--lp-field-bg": "#ffffff",
    "--lp-field-border": EDITORIAL.line,
    "--lp-field-ink": EDITORIAL.ink,
    "--lp-field-placeholder": "#9c9083",
    "--lp-sticky-bg": "rgba(239,233,223,0.96)",
    "--lp-glint": "rgba(255,255,255,0.55)",
    "--lp-chip": "rgba(34,26,19,0.05)",
    "--lp-display-weight": "500",
    "--lp-display-tracking": "-0.015em",
  } as CSSProperties;
}

/**
 * Tokens da direção "vitrine" (Fase 3): a pele de quem vende peça. Fundo quase
 * branco e superfície branca para a foto ser a única cor forte da tela — o
 * oposto da impacto, onde o fundo escuro é o palco. Fio fino e sem brilho: aqui
 * o cartão é etiqueta, não peça de vitrine iluminada. Display em sans pesado
 * com tracking curto, do jeito que catálogo de atacado escreve preço.
 */
export const VITRINE = {
  bg: "#f7f7f5",
  surface: "#ffffff",
  surface2: "#f0efec",
  ink: "#14161a",
  muted: "#6a6f78",
  line: "#e3e2de",
} as const;

export function vitrineStyle(palette: AccessiblePalette): CSSProperties {
  return {
    "--lp-bg": VITRINE.bg,
    "--lp-surface": VITRINE.surface,
    "--lp-surface-2": VITRINE.surface2,
    "--lp-ink": VITRINE.ink,
    "--lp-muted": VITRINE.muted,
    "--lp-line": VITRINE.line,
    "--lp-brand": palette.brand,
    "--lp-on-brand": palette.onBrand,
    "--lp-accent": palette.accent,
    "--lp-brand-soft": `${palette.brand}14`, // ~8%: etiqueta de preço sobre o branco
    "--lp-brand-glow": `${palette.brand}1f`,
    "--lp-field-bg": "#ffffff",
    "--lp-field-border": VITRINE.line,
    "--lp-field-ink": VITRINE.ink,
    "--lp-field-placeholder": "#9aa0a8",
    "--lp-sticky-bg": "rgba(247,247,245,0.96)",
    "--lp-glint": "rgba(255,255,255,0.9)",
    "--lp-chip": "rgba(20,22,26,0.04)",
    "--lp-display-weight": "700",
    "--lp-display-tracking": "-0.02em",
  } as CSSProperties;
}

/** Fundo da direção — é o que a paleta acessível da marca recebe como base. */
export function directionBackground(direction: LpDirection): string {
  if (direction === "editorial") return EDITORIAL.paper;
  if (direction === "vitrine") return VITRINE.bg;
  return IMPACTO.bg;
}

/** Direções claras derivam a paleta da marca SOBRE o claro; a impacto, sobre o escuro. */
export function isLightDirection(direction: LpDirection): boolean {
  return direction !== "impacto";
}

export function directionStyle(direction: LpDirection, palette: AccessiblePalette): CSSProperties {
  if (direction === "editorial") return editorialStyle(palette);
  if (direction === "vitrine") return vitrineStyle(palette);
  return impactoStyle(palette);
}

/**
 * Escala tipográfica. Strings literais pro Tailwind compilar. Display em
 * `--lp-font-display` (Bricolage Grotesque, carregada pela estrutura); corpo
 * herda a Plex Sans do layout raiz; meta em mono (etiqueta).
 */
export const T = {
  eyebrow: "font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--lp-accent)]",
  display:
    "[font-family:var(--lp-font-display)] [font-weight:var(--lp-display-weight)] [letter-spacing:var(--lp-display-tracking)] text-[2.35rem] leading-[1.02] text-[color:var(--lp-ink)] sm:text-[3.1rem] lg:text-[3.9rem]",
  h2: "[font-family:var(--lp-font-display)] [font-weight:var(--lp-display-weight)] [letter-spacing:var(--lp-display-tracking)] text-[1.75rem] leading-[1.08] text-[color:var(--lp-ink)] lg:text-[2.4rem]",
  h3: "[font-family:var(--lp-font-display)] [font-weight:var(--lp-display-weight)] text-[1.15rem] leading-snug tracking-[-0.01em] text-[color:var(--lp-ink)]",
  lead: "text-[1.05rem] leading-relaxed text-[color:var(--lp-muted)] lg:text-lg",
  body: "text-[0.95rem] leading-relaxed text-[color:var(--lp-muted)]",
  meta: "font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--lp-muted)]",
  number:
    "[font-family:var(--lp-font-display)] [font-weight:var(--lp-display-weight)] text-[2.6rem] leading-none tracking-[-0.04em] text-[color:var(--lp-accent)] tabular-nums lg:text-[3.4rem]",
} as const;

/** Container e ritmo vertical comuns a todas as seções. */
export const WRAP = "mx-auto w-full max-w-md px-6 lg:max-w-6xl lg:px-10";
export const SECTION = "py-14 lg:py-24";
