import { contrastRatio, parseHex, relativeLuminance, type Rgb } from "@/lib/pages/palette";

/**
 * Cores dos modelos do link da bio (spec 2026-10-19-link-da-bio §3). Puro: a prévia do painel
 * e a página pública chamam a mesma função.
 *
 * As 16 paletas prontas são as do mockup, hex por hex (paletas.json; lá a `azul` se chama
 * `mks`). "Cores da sua marca" deriva o resto a partir de `fundo` e `botao` como a `derivada()`
 * do mockup, com três correções medidas (ver o plano do PR 2, "Decisões"): `escuro` = o texto
 * da página é branco; `garante` empurra a cor para o lado em que ela já está; e Vitrine e
 * Clássico calculam o acento contra o fundo em que ele é desenhado. Depois, todo par de
 * `PARES_DE_CONTRASTE` passa por `garante` — nas paletas prontas isso não muda nada.
 *
 * Foco: `--foco` é o anel onde ficam os links (`FUNDOS_DO_FOCO`); no Romaneio, fora da nota,
 * vale `--foco-fora`; dentro do `--papel` dos outros modelos o CSS usa `--tinta`. Todos ≥ 3:1
 * contra o fundo em que aparecem.
 */

const PRETO = "#000000";
const BRANCO = "#FFFFFF";

function rgb(hex: string): Rgb {
  const c = parseHex(hex);
  if (!c) throw new Error(`cor inválida: ${hex}`);
  return c;
}

function paraHex(c: Rgb): string {
  const canal = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${canal(c.r)}${canal(c.g)}${canal(c.b)}`.toUpperCase();
}

function luminancia(hex: string): number {
  return relativeLuminance(rgb(hex));
}

export function contraste(a: string, b: string): number {
  return contrastRatio(rgb(a), rgb(b));
}

function mistura(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return paraHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Branco ou preto, o que tiver mais contraste com `fundo`. */
function textoSobre(fundo: string): string {
  return contraste(BRANCO, fundo) >= contraste(PRETO, fundo) ? BRANCO : PRETO;
}

/**
 * Mistura `fg` rumo a `alvo` em passos de 10% até `min:1` contra `bg`. Só aceita o `fg`
 * original se ele já estiver do lado do `alvo` (senão um botão claro sobre fundo médio
 * "passaria" pelo lado errado). `null` = nem o próprio alvo chega.
 */
function rumo(fg: string, bg: string, min: number, alvo: string): string | null {
  const ladoDoAlvo = luminancia(fg) >= luminancia(bg) === luminancia(alvo) >= luminancia(bg);
  if (ladoDoAlvo && contraste(fg, bg) >= min) return fg;
  for (let passo = 1; passo <= 10; passo++) {
    const cor = mistura(fg, alvo, passo / 10);
    if (contraste(cor, bg) >= min) return cor;
  }
  return null;
}

/**
 * Mistura `fg` rumo a #000000 ou #FFFFFF até ter `min:1` contra `bg` — primeiro para o lado
 * em que `fg` já está (texto escuro continua escuro), e só se não der, para o outro. Se nem
 * assim, o extremo de maior contraste.
 */
export function garante(fg: string, bg: string, min: number): string {
  if (contraste(fg, bg) >= min) return paraHex(rgb(fg));
  const claro = luminancia(fg) >= luminancia(bg);
  return rumo(fg, bg, min, claro ? BRANCO : PRETO) ?? rumo(fg, bg, min, claro ? PRETO : BRANCO) ?? textoSobre(bg);
}
