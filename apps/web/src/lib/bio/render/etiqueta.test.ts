import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo } from "@/lib/bio/cores";
import { PALETAS } from "@/lib/bio/documento";
import { contrastRatio, parseHex } from "@/lib/pages/palette";
import { CSS_ETIQUETA } from "./etiqueta";
import { CSS_BASE, tokensValidos } from "./partes";

/** Todo par de cor que o CSS do Etiqueta desenha: [frente, fundo, mínimo, onde]. */
const PARES: [string, string, number, string][] = [
  ["on", "fundo2", 4.5, "frase, nome e Abrir no Google Maps"],
  ["on", "fundo1", 3, "topo do degradê (o contraste.py do mockup aceita 3)"],
  ["on", "chip", 4.5, "destaques"],
  ["acento", "chip", 4.5, "número do destaque"],
  ["on2", "fundo3", 4.5, "rodapé"],
  ["tinta", "cartao", 4.5, "título da etiqueta"],
  ["tinta2", "cartao", 4.5, "subtítulo da etiqueta"],
  ["seta", "cartao", 3, "seta"],
  ["ico", "icobg", 4.5, "ícone e texto do Copiar CNPJ"],
  ["printinta", "prin", 4.5, "etiqueta principal"],
  ["tinta", "papel", 4.5, "confere, endereço, horário e o aviso #lk-status"],
  ["ico", "papel", 4.5, "título do confere"],
  ["foco", "fundo1", 3, "anel de foco no degradê"],
  ["foco", "fundo2", 3, "anel de foco no degradê"],
  ["foco", "fundo3", 3, "anel de foco no degradê"],
];

const razao = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

/** O ícone do principal fica sobre rgb(0 0 0 / .1) em cima de --prin. */
function escurece(hex: string, t: number): string {
  const c = parseHex(hex)!;
  return `#${[c.r, c.g, c.b].map((v) => Math.round(v * (1 - t)).toString(16).padStart(2, "0")).join("")}`;
}

function falhas(t: Record<string, string>): string[] {
  const cor = (nome: string) => t[`--${nome}`];
  const lista = PARES.flatMap(([a, b, min, onde]) =>
    !cor(a) || !cor(b) || razao(cor(a), cor(b)) < min ? [`${a}/${b} (${onde})`] : [],
  );
  if (!cor("printinta") || !cor("prin") || razao(cor("printinta"), escurece(cor("prin"), 0.1)) < 3) lista.push("ícone do principal");
  return lista;
}

/** mulberry32: 500 cores iguais em toda rodada. */
function sorteio(semente: number) {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `[seletor, declarações]` de cada regra (inclusive as de dentro do @media). */
function regras(css: string): [string, string][] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

test("as 4 paletas do Etiqueta passam em todo par que o modelo desenha", () => {
  for (const paleta of PALETAS.etiqueta) {
    assert.deepEqual(falhas(tokensValidos(coresDoModelo("etiqueta", paleta, null))), [], paleta);
  }
});

test("cores da marca: 500 pares aleatórios passam em todo par", () => {
  const r = sorteio(20261019);
  const hex = () => `#${Math.floor(r() * 0x1000000).toString(16).padStart(6, "0").toUpperCase()}`;
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhas(tokensValidos(coresDoModelo("etiqueta", "marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}/${cores.botao}: ${f.join(", ")}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
});

test("toda variável que o CSS lê existe nas 4 paletas e na marca", () => {
  const usadas = [...new Set(`${CSS_BASE}${CSS_ETIQUETA}`.match(/var\(--[a-z0-9-]+\)/g))].map((v) => v.slice(4, -1));
  assert.ok(usadas.length >= 19); // --fundo1 saiu do degradê (texto do topo a 4.5:1)
  for (const paleta of [...PALETAS.etiqueta, "marca"]) {
    const cores = paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null;
    const t = tokensValidos(coresDoModelo("etiqueta", paleta, cores));
    assert.deepEqual(usadas.filter((v) => !(v in t)), [], paleta);
  }
});

test("a máscara da etiqueta fica no ::before: o <a> focado não é recortado", () => {
  const comMascara = regras(CSS_ETIQUETA).filter(([, decl]) => /(?:^|;)(?:-webkit-)?mask/.test(decl));
  assert.ok(comMascara.length > 0);
  for (const [seletor] of comMascara) assert.match(seletor, /::before$/, seletor);
});

test("nada de opacity em texto: só o fio decorativo usa", () => {
  const comOpacity = regras(CSS_ETIQUETA).filter(([, decl]) => /opacity/.test(decl)).map(([s]) => s);
  assert.deepEqual(comOpacity, [".et-fio::before"]);
});

test("cor de paleta só por var(--…): hex literal só fora da paleta", () => {
  const literais = new Set(CSS_ETIQUETA.match(/#[0-9A-Fa-f]{3,8}\b/g));
  assert.deepEqual([...literais].sort(), ["#0000", "#000", "#25D366", "#fff"].sort());
});

test("o balanço do toque não depende da entrada; tudo que mexe fica em no-preference", () => {
  const [antes, depois] = CSS_ETIQUETA.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  assert.match(depois, /\.et-tag\.lk-toque\{animation:et-balanca/);
  assert.doesNotMatch(depois, /\.lk-entra \.et-tag\.lk-toque/);
  assert.match(depois, /\.lk-entra \.et-fio>li\{animation:et-assenta/);
  assert.match(depois, /\.lk-entra \.et-fio>li:nth-child\(2\)\{animation-delay:70ms\}/);
});

test("alvo de toque ≥ 44 px no que não é etiqueta", () => {
  assert.match(CSS_ETIQUETA, /\.et-copiar\{[^}]*min-height:44px/);
  assert.match(CSS_ETIQUETA, /\.et-mapa\{[^}]*min-height:48px/);
  assert.match(CSS_ETIQUETA, /\.et-tag\{[^}]*min-height:76px/);
});

/** Mistura sRGB de dois hex (o que o degradê pinta entre duas paradas). */
function mistura(a: string, b: string, t: number): string {
  const x = parseHex(a)!;
  const y = parseHex(b)!;
  return `#${(["r", "g", "b"] as const).map((k) => Math.round(x[k] + (y[k] - x[k]) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Frase e local (texto pequeno, --on) ficam sobre o degradê do .et: toda parada e todo meio-termo ≥ 4.5. */
function falhasDoTopo(t: Record<string, string>): string[] {
  const regra = regras(CSS_ETIQUETA).find(([s]) => s === ".et");
  const paradas = [...(regra?.[1].match(/background:[^;]*/)?.[0] ?? "").matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => t[`--${m[1]}`]);
  if (paradas.length === 0 || paradas.some((c) => !c)) return ["degradê do .et sem paradas válidas"];
  const fundos = paradas.flatMap((c, i) => (i === 0 ? [c] : [0.25, 0.5, 0.75, 1].map((p) => mistura(paradas[i - 1], c, p))));
  return fundos.filter((f) => razao(t["--on"], f) < 4.5).map((f) => `on/${f} ${razao(t["--on"], f).toFixed(2)}`);
}

test("frase e local do topo: o fundo atrás deles dá ≥ 4.5 nas 4 paletas e em 500 cores da marca", () => {
  for (const paleta of PALETAS.etiqueta) {
    assert.deepEqual(falhasDoTopo(tokensValidos(coresDoModelo("etiqueta", paleta, null))), [], paleta);
  }
  const r = sorteio(20261019);
  const hex = () => `#${Math.floor(r() * 0x1000000).toString(16).padStart(6, "0").toUpperCase()}`;
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhasDoTopo(tokensValidos(coresDoModelo("etiqueta", "marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}: ${f[0]}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
  assert.doesNotMatch(regras(CSS_ETIQUETA).filter(([s]) => [".et-marca", ".et-frase", ".et-local"].includes(s)).map(([, d]) => d).join(";"), /background|color:/);
});
