/**
 * Contas dos testes dos modelos do link da bio (Vitrine, Romaneio, Clássico):
 * contraste entre tokens, cor sorteada e leitura do CSS. Só teste — nada daqui
 * vai para a página.
 */
import { contrastRatio, parseHex } from "@/lib/pages/palette";

/** Razão de contraste entre dois `#RRGGBB`; cor inválida (token que faltou) é erro. */
export function razao(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) throw new Error(`cor inválida: ${a} / ${b}`);
  return contrastRatio(x, y);
}

/** `cor` misturada `t` (0..1) rumo a `alvo`: o que se vê sob um véu `rgb(alvo / t)`. */
export function mistura(cor: string, alvo: string, t: number): string {
  const x = parseHex(cor);
  const y = parseHex(alvo);
  if (!x || !y) throw new Error(`cor inválida: ${cor} / ${alvo}`);
  const canal = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  return `#${canal(x.r, y.r)}${canal(x.g, y.g)}${canal(x.b, y.b)}`.toUpperCase();
}

/** `[frente, fundo, mínimo, onde]`: um par que o CSS desenha. */
export type Par = readonly [frente: string, fundo: string, minimo: number, onde: string];

/** Os pares abaixo do mínimo, com a razão medida (lista vazia = tudo passa). */
export function falhas(pares: readonly Par[]): string[] {
  return pares.flatMap(([a, b, min, onde]) => {
    const r = razao(a, b);
    return r >= min ? [] : [`${onde}: ${a} sobre ${b} = ${r.toFixed(2)} < ${min}`];
  });
}

/** mulberry32: as mesmas cores em toda rodada (a falha se repete em qualquer máquina). */
export function sorteio(semente: number): () => string {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const n = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return `#${Math.floor(n * 0x1000000).toString(16).padStart(6, "0").toUpperCase()}`;
  };
}

const KEYFRAMES = /@keyframes ([\w-]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g;

/** `[seletor, declarações]` das regras fora de @keyframes (as de dentro de @media entram). */
export function regras(css: string): [string, string][] {
  const semKeyframes = css.replace(KEYFRAMES, "");
  return [...semKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** Corpo de cada @keyframes, pelo nome. */
export function keyframes(css: string): Record<string, string> {
  return Object.fromEntries([...css.matchAll(KEYFRAMES)].map((m) => [m[1], m[2]]));
}

/** As variáveis que o CSS lê (sem o `--`). */
export function variaveisLidas(css: string): string[] {
  return [...new Set(css.match(/var\(--[a-z0-9-]+\)/g) ?? [])].map((v) => v.slice(6, -1));
}

/** Cor escrita direto no CSS (fora de var()). */
export function hexLiterais(css: string): string[] {
  return [...new Set(css.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [])].sort();
}
