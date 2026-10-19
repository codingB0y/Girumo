import { contrastRatio, parseHex, relativeLuminance, type Rgb } from "@/lib/pages/palette";

import { PALETAS, type DocumentoBio, type Modelo } from "./documento";

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

/** As variáveis CSS do modelo, com o `--` (`{"--fundo1": "#3A80BF", …}`); valor sempre `#RRGGBB`. */
export type TokensBio = Record<string, string>;

const MIN_FOCO = 3;

type Paleta = Readonly<Record<string, string>>;

/** paletas.json, cópia fiel (só `mks` virou `azul`; `avatar` do Clássico não é usada pelo CSS). */
export const PALETAS_PRONTAS: Readonly<Record<Modelo, Readonly<Record<string, Paleta>>>> = {
  etiqueta: {
    azul: { fundo1: "#3A80BF", fundo2: "#286AA6", fundo3: "#173F68", on: "#FFFFFF", on2: "#D3DEEA", chip: "#1C4E7E", chipbd: "#5E8DBB", fio: "#D7A85A", acento: "#F2CD8A", cartao: "#FFFFFF", tinta: "#16304F", tinta2: "#4A6285", icobg: "#E9EAE4", ico: "#286AA6", seta: "#5D799E", prin: "#E98B2B", printinta: "#142A44", papel: "#F6F6F2", linha: "#B9C4D1", foco: "#D7A85A" },
    rosa: { fundo1: "#CC5283", fundo2: "#B83A6B", fundo3: "#6E1D40", on: "#FFFFFF", on2: "#F3D6E2", chip: "#8E2A53", chipbd: "#D27FA2", fio: "#FFD27A", acento: "#FFD98F", cartao: "#FFFFFF", tinta: "#3B1528", tinta2: "#6B4256", icobg: "#FBE4EE", ico: "#B83A6B", seta: "#8E6578", prin: "#FFD24D", printinta: "#3B1528", papel: "#FFF6FA", linha: "#E2BFCF", foco: "#FFD27A" },
    menta: { fundo1: "#1C8A76", fundo2: "#12705F", fundo3: "#083F36", on: "#FFFFFF", on2: "#CFE6E0", chip: "#0C5045", chipbd: "#5FA597", fio: "#F4C66B", acento: "#F7D48E", cartao: "#FFFFFF", tinta: "#0F2F2A", tinta2: "#45635D", icobg: "#E3F2EE", ico: "#12705F", seta: "#5C7F78", prin: "#FF8A5B", printinta: "#2A140C", papel: "#F4FAF8", linha: "#B7CFC9", foco: "#F4C66B" },
    grafite: { fundo1: "#3A3D45", fundo2: "#24262C", fundo3: "#0F1013", on: "#F4F1EA", on2: "#C9C5BC", chip: "#33363E", chipbd: "#55585F", fio: "#D4AF37", acento: "#E2C35E", cartao: "#F6F3EA", tinta: "#1D1E22", tinta2: "#55575E", icobg: "#E9E4D6", ico: "#24262C", seta: "#6A6C72", prin: "#D4AF37", printinta: "#1D1E22", papel: "#FBF9F4", linha: "#C9C5BC", foco: "#D4AF37" },
  },
  vitrine: {
    papel: { fundo1: "#FFFFFF", fundo2: "#FAF7F2", fundo3: "#EFE9DF", on: "#1B1A17", on2: "#5E5A52", linha: "#E6DFD3", acento: "#A8432C", cartao: "#FFFFFF", tinta: "#1B1A17", tinta2: "#5E5A52", icobg: "#F1EBE0", ico: "#A8432C", seta: "#8A8478", prin: "#1B1A17", printinta: "#FAF7F2", papel: "#FFFFFF", foco: "#A8432C" },
    noite: { fundo1: "#1C1A18", fundo2: "#141312", fundo3: "#0B0A09", on: "#F3EFE8", on2: "#B9B2A6", linha: "#2E2B27", acento: "#D9B36C", cartao: "#1E1C1A", tinta: "#F3EFE8", tinta2: "#B9B2A6", icobg: "#262320", ico: "#D9B36C", seta: "#8E877C", prin: "#F3EFE8", printinta: "#141312", papel: "#1E1C1A", foco: "#D9B36C" },
    rose: { fundo1: "#FFFFFF", fundo2: "#FFF3F0", fundo3: "#F8E1DC", on: "#3A1E24", on2: "#7A5A60", linha: "#F0D8D3", acento: "#B23A63", cartao: "#FFFFFF", tinta: "#3A1E24", tinta2: "#7A5A60", icobg: "#FBE4E0", ico: "#B23A63", seta: "#A08488", prin: "#3A1E24", printinta: "#FFF3F0", papel: "#FFFFFF", foco: "#B23A63" },
    azul: { fundo1: "#FFFFFF", fundo2: "#F4F7FB", fundo3: "#E3EBF4", on: "#16304F", on2: "#4A6285", linha: "#DCE5EF", acento: "#286AA6", cartao: "#FFFFFF", tinta: "#16304F", tinta2: "#4A6285", icobg: "#E6EEF7", ico: "#286AA6", seta: "#5D799E", prin: "#E98B2B", printinta: "#142A44", papel: "#FFFFFF", foco: "#286AA6" },
  },
  romaneio: {
    kraft: { fundo1: "#D2B08A", fundo2: "#C4A07A", fundo3: "#A8835E", on: "#2B2117", on2: "#3F3122", papel: "#FFFDF7", tinta: "#24211C", tinta2: "#5F584D", linha: "#D9D1C2", acento: "#B3261E", foco: "#B3261E" },
    caneta: { fundo1: "#2D5291", fundo2: "#23457D", fundo3: "#172F57", on: "#FFFFFF", on2: "#C9D5EA", papel: "#FFFDF7", tinta: "#1C2538", tinta2: "#57607A", linha: "#D8DCE6", acento: "#1F55C6", foco: "#1F55C6" },
    nota: { fundo1: "#376A5B", fundo2: "#2D5A4D", fundo3: "#1D3D34", on: "#FFFFFF", on2: "#CFE1DA", papel: "#F8FAF3", tinta: "#1E2A25", tinta2: "#56645D", linha: "#D5DDD3", acento: "#23704A", foco: "#23704A" },
    azul: { fundo1: "#3A80BF", fundo2: "#286AA6", fundo3: "#173F68", on: "#FFFFFF", on2: "#E8EFF7", papel: "#FFFDF7", tinta: "#16304F", tinta2: "#4A6285", linha: "#D9DEE6", acento: "#A8500C", foco: "#A8500C" },
  },
  classico: {
    claro: { fundo1: "#F7F5F1", fundo2: "#F2F0EB", fundo3: "#E5E2DA", on: "#161616", on2: "#57544E", chip: "#FFFFFF", chipbd: "#E2DED5", acento: "#161616", cartao: "#FFFFFF", tinta: "#161616", tinta2: "#5F5B54", icobg: "#F2F0EB", ico: "#161616", seta: "#7A766E", prin: "#161616", printinta: "#FFFFFF", papel: "#FFFFFF", linha: "#E2DED5", avatar: "#FFFFFF", anel: "#161616", foco: "#161616" },
    escuro: { fundo1: "#181818", fundo2: "#111111", fundo3: "#0A0A0A", on: "#F5F5F5", on2: "#B5B5B5", chip: "#1F1F1F", chipbd: "#2C2C2C", acento: "#FFD400", cartao: "#1E1E1E", tinta: "#F5F5F5", tinta2: "#B5B5B5", icobg: "#2A2A2A", ico: "#FFD400", seta: "#9A9A9A", prin: "#FFD400", printinta: "#111111", papel: "#1E1E1E", linha: "#2C2C2C", avatar: "#FFFFFF", anel: "#FFD400", foco: "#FFD400" },
    lavanda: { fundo1: "#F4F1FF", fundo2: "#ECE8FF", fundo3: "#DDD6FF", on: "#2A1E5C", on2: "#5A4F86", chip: "#FFFFFF", chipbd: "#DCD5FB", acento: "#4F35D6", cartao: "#FFFFFF", tinta: "#2A1E5C", tinta2: "#5F5689", icobg: "#EFEBFF", ico: "#4F35D6", seta: "#8A82B0", prin: "#4F35D6", printinta: "#FFFFFF", papel: "#FFFFFF", linha: "#DCD5FB", avatar: "#FFFFFF", anel: "#4F35D6", foco: "#4F35D6" },
    azul: { fundo1: "#3A80BF", fundo2: "#286AA6", fundo3: "#173F68", on: "#FFFFFF", on2: "#E8EFF7", chip: "#1C4E7E", chipbd: "#5E8DBB", acento: "#F2CD8A", cartao: "#FFFFFF", tinta: "#16304F", tinta2: "#4A6285", icobg: "#E9EAE4", ico: "#286AA6", seta: "#5D799E", prin: "#E98B2B", printinta: "#142A44", papel: "#FFFFFF", linha: "#B9C4D1", avatar: "#FFFFFF", anel: "#D7A85A", foco: "#D7A85A" },
  },
};

/** As variáveis que o CSS de cada modelo lê (Main.dc.html), na ordem em que saem. */
const VARIAVEIS: Readonly<Record<Modelo, readonly string[]>> = {
  etiqueta: ["fundo1", "fundo2", "fundo3", "on", "on2", "chip", "chipbd", "fio", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "linha", "foco"],
  vitrine: ["fundo2", "on", "on2", "linha", "acento", "tinta", "icobg", "ico", "seta", "prin", "printinta", "papel", "foco"],
  romaneio: ["fundo1", "fundo2", "fundo3", "on", "on2", "papel", "tinta", "tinta2", "linha", "acento", "foco", "foco-fora"],
  classico: ["fundo2", "fundo3", "on", "on2", "chip", "chipbd", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "anel", "foco"],
};

/** `[texto, fundo, mínimo]`: cada cor que o CSS desenha sobre cada fundo. A ordem importa (o mesmo texto só escurece/clareia). */
export type ParDeContraste = readonly [texto: string, fundo: string, minimo: number];

/**
 * Os pares do `contraste.py` do mockup mais os que ele não via no CSS (ícone que vira texto
 * no "Copiar CNPJ" e no título do confere, horário sobre o papel, texto no pé do degradê).
 * Texto 4,5; ícone, seta e o nome grande no topo claro do degradê 3. O renderizador
 * (PRs 3a/3b) só pinta texto com pares desta lista; o véu da foto é fixo no CSS (sem token).
 */
export const PARES_DE_CONTRASTE: Readonly<Record<Modelo, readonly ParDeContraste[]>> = {
  etiqueta: [
    ["on", "fundo2", 4.5], ["on", "fundo1", 3], ["on", "fundo3", 4.5], ["on", "chip", 4.5],
    ["acento", "chip", 4.5], ["on2", "fundo3", 4.5],
    ["tinta", "cartao", 4.5], ["tinta", "papel", 4.5], ["tinta2", "cartao", 4.5], ["tinta2", "papel", 4.5],
    ["seta", "cartao", 3], ["ico", "icobg", 4.5], ["ico", "papel", 4.5], ["printinta", "prin", 4.5],
  ],
  vitrine: [
    ["on", "fundo2", 4.5], ["on2", "fundo2", 4.5], ["acento", "fundo2", 4.5], ["acento", "papel", 4.5],
    ["seta", "fundo2", 3], ["ico", "icobg", 3], ["printinta", "prin", 4.5], ["tinta", "papel", 4.5],
  ],
  romaneio: [
    ["tinta", "papel", 4.5], ["tinta2", "papel", 4.5], ["acento", "papel", 4.5],
    ["on", "fundo2", 4.5], ["on2", "fundo2", 4.5],
  ],
  classico: [
    ["on", "fundo2", 4.5], ["on", "chip", 4.5], ["on2", "fundo2", 4.5], ["acento", "chip", 4.5],
    ["tinta", "cartao", 4.5], ["tinta", "icobg", 4.5], ["tinta", "papel", 4.5],
    ["tinta2", "cartao", 4.5], ["tinta2", "papel", 4.5], ["seta", "cartao", 3],
    ["ico", "icobg", 3], ["ico", "papel", 4.5], ["printinta", "prin", 4.5],
  ],
};

/**
 * Onde o modelo desenha o anel de `--foco` (3:1 contra cada um, spec §3): onde ficam os links.
 * Dentro dos blocos de `--papel` do Etiqueta, Vitrine e Clássico (confere, endereço) o anel é
 * `var(--tinta)` — o par tinta/papel já garante 4,5 —, então o `--foco` não aparece lá.
 */
export const FUNDOS_DO_FOCO: Readonly<Record<Modelo, readonly string[]>> = {
  etiqueta: ["fundo1", "fundo2", "fundo3"],
  vitrine: ["fundo2"],
  romaneio: ["papel"],
  classico: ["fundo2"],
};

/** Só o Romaneio tem `--foco-fora`: o anel fora da nota, sobre o fundo da página. */
export const FUNDOS_DO_FOCO_FORA: readonly string[] = ["fundo1", "fundo2", "fundo3"];

function derivada(modelo: Modelo, fundo: string, botao: string): Record<string, string> {
  const on = textoSobre(fundo);
  const escuro = on === BRANCO;
  const tinta = garante(mistura(fundo, PRETO, 0.6), BRANCO, 7);
  const tinta2 = garante(mistura(tinta, BRANCO, 0.3), BRANCO, 4.5);
  const icobg = mistura(fundo, BRANCO, 0.88);
  const chip = escuro ? mistura(fundo, PRETO, 0.28) : BRANCO;
  const t: Record<string, string> = {
    fundo1: escuro ? garante(mistura(fundo, BRANCO, 0.12), on, 3) : mistura(fundo, BRANCO, 0.5),
    fundo2: fundo,
    fundo3: escuro ? mistura(fundo, PRETO, 0.45) : garante(mistura(fundo, PRETO, 0.08), on, 4.5),
    on,
    on2: garante(mistura(on, fundo, 0.25), fundo, 4.5),
    prin: botao,
    printinta: textoSobre(botao),
    foco: on,
    anel: botao,
    cartao: BRANCO,
    papel: mistura(fundo, BRANCO, 0.94),
    tinta,
    tinta2,
    icobg,
    ico: garante(escuro ? fundo : mistura(fundo, PRETO, 0.5), icobg, 3),
    seta: garante(mistura(tinta2, BRANCO, 0.15), BRANCO, 3),
    linha: mistura(tinta, BRANCO, 0.75),
    chip,
    chipbd: mistura(chip, on, 0.3),
    fio: mistura(botao, BRANCO, 0.25),
    acento: garante(mistura(botao, BRANCO, escuro ? 0.35 : 0), chip, 4.5),
  };
  if (modelo === "vitrine") {
    // Como a paleta "noite": o papel do confere acompanha a página e o texto dele é o da
    // página; o acento fica do lado do texto, para valer na folha e no confere.
    if (escuro) t.papel = garante(mistura(fundo, BRANCO, 0.08), on, 4.5);
    t.tinta = on;
    t.tinta2 = t.on2;
    t.acento = rumo(botao, fundo, 4.5, on) ?? on;
  }
  if (modelo === "romaneio") {
    t.papel = "#FFFDF7";
    t.tinta = "#1F1D19";
    t.tinta2 = "#5F584D";
    t.linha = "#D9D1C2";
    t.acento = garante(botao, t.papel, 4.5);
  }
  return t;
}

/** De `candidatas`, a de maior contraste mínimo contra `fundos` (empate: a primeira). */
function melhorAnel(candidatas: readonly string[], fundos: readonly string[]): string {
  const pior = (cor: string) => Math.min(...fundos.map((f) => contraste(cor, f)));
  return candidatas.reduce((melhor, cor) => (pior(cor) > pior(melhor) ? cor : melhor));
}

/**
 * Os tokens do modelo para a paleta escolhida. `"marca"` sem cores válidas (ou paleta que não é
 * do modelo) cai na primeira paleta do modelo — o renderizador nunca recebe cor fora de `#RRGGBB`.
 */
export function coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio {
  const fundo = paleta === "marca" && cores ? parseHex(cores.fundo) : null;
  const botao = paleta === "marca" && cores ? parseHex(cores.botao) : null;
  const base =
    fundo && botao
      ? derivada(modelo, paraHex(fundo), paraHex(botao))
      : (PALETAS_PRONTAS[modelo][paleta] ?? PALETAS_PRONTAS[modelo][PALETAS[modelo][0]]);
  const t: Record<string, string> = { ...base };
  for (const [texto, fundo, minimo] of PARES_DE_CONTRASTE[modelo]) t[texto] = garante(t[texto], t[fundo], minimo);
  // O foco da paleta (o dourado do Etiqueta, o carimbo do Romaneio) fica onde passa; onde não
  // passa, o texto daquele fundo, o preto ou o branco — o de maior contraste mínimo.
  const fundosDoFoco = FUNDOS_DO_FOCO[modelo].map((f) => t[f]);
  const passa = fundosDoFoco.every((f) => contraste(base.foco, f) >= MIN_FOCO);
  t.foco = passa ? base.foco : melhorAnel([modelo === "romaneio" ? t.tinta : t.on, PRETO, BRANCO], fundosDoFoco);
  if (modelo === "romaneio") t["foco-fora"] = melhorAnel([t.on, PRETO, BRANCO], FUNDOS_DO_FOCO_FORA.map((f) => t[f]));
  return Object.fromEntries(VARIAVEIS[modelo].map((v) => [`--${v}`, t[v]]));
}
