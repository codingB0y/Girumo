/**
 * Tokens da direção editorial-premium ("Acesso VIP") da LP v2 — atacado de moda.
 *
 * A SUPERFÍCIE é fixa e neutra (paper/ink/wine/line), garantindo contraste AA por
 * construção. A COR DA MARCA do lojista entra como accent dinâmico via CSS vars
 * (`brandStyle`), derivada com contraste acessível em runtime — é ela, e não um
 * tom fixo, que dá identidade a cada página (CTA, selo, fio ativo).
 *
 * Assinatura visual: rótulos em mono (etiqueta de peça / romaneio do atacado) e
 * fios finos em `wine` como divisores editoriais.
 */

import type { CSSProperties } from "react";
import type { AccessiblePalette } from "@/lib/pages/palette";

/** Cores de superfície fixas (hex) — usadas em arbitrary values e style inline. */
export const EDITORIAL = {
  paper: "#efe9df", // fundo papel quente (creme editorial)
  paperShade: "#e7dfd2", // banda de prova / cartões sobre o papel
  ink: "#221a13", // tinta (texto e títulos)
  inkSoft: "#6f6558", // texto secundário
  line: "#ddd2c2", // hairlines / divisores neutros
  wine: "#6d2436", // filete editorial fixo (aspas) — o accent real vem da marca
} as const;

/**
 * CSS vars da marca (accent acessível) — setadas no wrapper da estrutura.
 * As seções referenciam `var(--lp-brand)` / `var(--lp-on-brand)` em classes
 * arbitrary (`bg-[var(--lp-brand)]`), então a cor arbitrária do lojista nunca
 * vira classe Tailwind dinâmica.
 */
export function brandStyle(palette: AccessiblePalette): CSSProperties {
  return {
    // Bloco sólido da marca (CTA/selo): a cor original pareada com o texto que a
    // paleta garante legível SOBRE ela (`onBrand`).
    "--lp-brand": palette.brand,
    "--lp-on-brand": palette.onBrand,
    // Marca como TEXTO/fio sobre o papel: usa `accent` (escurecido p/ ≥4.5:1).
    "--lp-accent": palette.accent,
    "--lp-brand-soft": `${palette.brand}1a`, // ~10% de opacidade (selo suave)
  } as CSSProperties;
}

/**
 * Escala tipográfica editorial. Strings literais para o Tailwind compilar as
 * classes ao escanear este arquivo. Display serif de alto contraste (moda),
 * corpo sans legível, meta em mono (etiqueta).
 */
export const TYPE = {
  eyebrow: "font-mono text-[11px] uppercase tracking-[0.2em]",
  display:
    "font-serif text-[2.15rem] leading-[1.05] tracking-tight sm:text-[2.6rem] lg:text-[3.1rem]",
  h2: "font-serif text-[1.6rem] leading-tight tracking-tight lg:text-[2rem]",
  lead: "text-[1.05rem] leading-relaxed lg:text-lg",
  body: "text-[0.95rem] leading-relaxed",
  meta: "font-mono text-[11px] uppercase tracking-[0.18em]",
} as const;
