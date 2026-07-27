/**
 * Paleta acessível (Girumo LP v2). A partir da cor da marca deriva cores
 * legíveis segundo o contraste WCAG 2.1 (razão ≥ 4.5:1 para texto normal):
 *  - accent : a cor da marca, escurecida se preciso, usável como texto/detalhe sobre fundo claro
 *  - onBrand: branco ou tinta escura — o que for legível SOBRE a cor da marca
 * Quando a cor original não passa, ajusta e explica em `reason`.
 */

export type Rgb = { r: number; g: number; b: number };

export type AccessiblePalette = {
  brand: string; // hex normalizado (#rrggbb) da cor original
  accent: string; // cor legível sobre fundo claro (marca ou versão escurecida)
  onBrand: string; // texto legível sobre a cor da marca
  adjusted: boolean; // true quando accent != brand
  reason: string | null; // explicação do ajuste (null quando não ajustou)
};

const LIGHT = "#ffffff";
const INK = "#111827";
const MIN_CONTRAST = 4.5;

const HEX_FULL = /^#?([0-9a-fA-F]{6})$/;
const HEX_SHORT = /^#?([0-9a-fA-F]{3})$/;

export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== "string") return null;
  const value = hex.trim();
  const full = HEX_FULL.exec(value);
  if (full) {
    const n = parseInt(full[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const short = HEX_SHORT.exec(value);
  if (short) {
    const s = short[1];
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  return null;
}

function toHex(c: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function channelLuminance(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(c: Rgb): number {
  return (
    0.2126 * channelLuminance(c.r) +
    0.7152 * channelLuminance(c.g) +
    0.0722 * channelLuminance(c.b)
  );
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function derivePalette(brandHex: string, opts?: { background?: string }): AccessiblePalette | null {
  const brand = parseHex(brandHex);
  if (!brand) return null;

  const white = parseHex(LIGHT) as Rgb;
  const ink = parseHex(INK) as Rgb;
  const background = parseHex(opts?.background ?? LIGHT) ?? white;
  const brandNorm = toHex(brand);

  // texto legível SOBRE a cor da marca: branco ou tinta escura, o que tiver mais contraste
  const onBrand = contrastRatio(brand, white) >= contrastRatio(brand, ink) ? LIGHT : INK;

  // a cor da marca como texto sobre o fundo claro
  const baseContrast = contrastRatio(brand, background);
  if (baseContrast >= MIN_CONTRAST) {
    return { brand: brandNorm, accent: brandNorm, onBrand, adjusted: false, reason: null };
  }

  // escurece multiplicando os canais por k (a luminância cai de forma monotônica)
  for (let k = 1; k >= 0; k -= 0.02) {
    const candidate: Rgb = { r: brand.r * k, g: brand.g * k, b: brand.b * k };
    if (contrastRatio(candidate, background) >= MIN_CONTRAST) {
      const accent = toHex(candidate);
      return {
        brand: brandNorm,
        accent,
        onBrand,
        adjusted: true,
        reason: `Cor da marca ${brandNorm} tinha contraste ${baseContrast.toFixed(2)}:1 sobre o fundo (mín. ${MIN_CONTRAST}:1); escurecida para ${accent}.`,
      };
    }
  }

  // fallback improvável: usa a tinta escura
  return {
    brand: brandNorm,
    accent: INK,
    onBrand,
    adjusted: true,
    reason: `Cor da marca ${brandNorm} não atingiu ${MIN_CONTRAST}:1 nem escurecendo; usando tinta ${INK}.`,
  };
}
