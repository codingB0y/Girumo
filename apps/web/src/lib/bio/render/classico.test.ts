import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo, type TokensBio } from "@/lib/bio/cores";
import { PALETAS, type DadosRender, type DocumentoBio } from "@/lib/bio/documento";
import { falhas, hexLiterais, keyframes, mistura, regras, sorteio, variaveisLidas, type Par } from "@/test/bio-contraste";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { CSS_CLASSICO } from "./classico";
import { renderPaginaBio } from "./index";
import { CSS_BASE, tokensValidos } from "./partes";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const tokens = (paleta: string, cores: DocumentoBio["cores"] = null) => tokensValidos(coresDoModelo("classico", paleta, cores));
const pagina = (perfil: Partial<DocumentoBio["perfil"]> = {}): string => {
  const d: DadosRender = dadosFalsos();
  const documento = { ...d.documento, modelo: "classico" as const, paleta: "claro", perfil: { ...d.documento.perfil, ...perfil } };
  return renderPaginaBio({ ...d, documento }, { modo: "publica", nonce: NONCE, animarEntrada: true });
};

/** Todo par de cor que o CSS do Clássico desenha. */
function pares(t: TokensBio): Par[] {
  const c = (nome: string) => t[`--${nome}`];
  return [
    [c("on"), c("fundo2"), 4.5, "nome e frase"],
    [c("on2"), c("fundo2"), 4.5, "@ e rodapé"],
    [c("on"), c("chip"), 4.5, "destaque"],
    [c("acento"), c("chip"), 4.5, "número do destaque"],
    [c("tinta"), c("cartao"), 4.5, "botão"],
    [c("tinta2"), c("cartao"), 4.5, "subtítulo do botão"],
    [c("seta"), c("cartao"), 3, "seta"],
    [c("ico"), c("icobg"), 3, "ícone"],
    [c("printinta"), c("prin"), 4.5, "botão principal (título, subtítulo e seta) e Abrir no Google Maps"],
    [c("printinta"), mistura(c("prin"), "#000000", 0.12), 3, "ícone do principal (véu preto de 12%)"],
    [c("tinta"), c("papel"), 4.5, "Como chegar, confere, anel de foco neles e o aviso #lk-status"],
    [c("tinta2"), c("papel"), 4.5, "horário"],
    [c("ico"), c("papel"), 4.5, "título e ícones do confere"],
    [c("tinta"), c("icobg"), 4.5, "Copiar CNPJ"],
    [c("foco"), c("fundo2"), 3, "anel de foco"],
  ];
}

test("as 4 paletas do Clássico passam em todo par que o modelo desenha", () => {
  for (const paleta of PALETAS.classico) assert.deepEqual(falhas(pares(tokens(paleta))), [], paleta);
});

test("cores da marca: 500 pares sorteados passam em todo par", () => {
  const hex = sorteio(20261019);
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhas(pares(tokens("marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}/${cores.botao}: ${f.join("; ")}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
});

test("toda variável que o CSS lê existe nas 4 paletas e na marca", () => {
  const usadas = variaveisLidas(`${CSS_BASE}${CSS_CLASSICO}`);
  assert.ok(usadas.includes("anel"));
  for (const paleta of [...PALETAS.classico, "marca"]) {
    const t = tokens(paleta, paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null);
    assert.deepEqual(usadas.filter((v) => !(`--${v}` in t)), [], paleta);
  }
});

test("o pulso do principal dá no máximo 2 voltas e só mexe em transform e opacity", () => {
  const regra = /\.lk-entra \.cl-btn--prin::after\{animation:cl-pulso ([^}]+)\}/.exec(CSS_CLASSICO)?.[1] ?? "";
  const voltas = regra.split(" ").find((p) => /^(?:\d+|infinite)$/.test(p));
  assert.equal(voltas, "2");
  const corpo = keyframes(CSS_CLASSICO)["cl-pulso"] ?? "";
  const propriedades = new Set([...corpo.matchAll(/([a-z-]+):/g)].map((m) => m[1]));
  assert.deepEqual([...propriedades].sort(), ["opacity", "transform"]);
});

test("foto redonda: zoom de 2,2× em volta do ponto de foco", () => {
  assert.match(CSS_CLASSICO, /\.cl-avatar img\{[^}]*object-fit:cover;transform:scale\(2\.2\)\}/);
  const html = pagina();
  assert.match(html, /<div class="cl-avatar"><img class="lk-f-50-30" src="[^"]*capa-falsa[^"]*" srcset="[^"]*384w[^"]*640w[^"]*828w" sizes="238px" width="108" height="108" alt="Fachada da loja de exemplo" fetchpriority="high" decoding="async"><\/div>/);
  assert.match(html, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.doesNotMatch(pagina({ capa: null }), /cl-avatar"|fetchpriority/);
});

test("nada de opacity em texto: só o anel do pulso e as entradas, que terminam em 1", () => {
  assert.deepEqual(regras(CSS_CLASSICO).filter(([, d]) => /opacity/.test(d)).map(([s]) => s), [".cl-btn--prin::after"]);
  const comFade = Object.entries(keyframes(CSS_CLASSICO)).filter(([, corpo]) => /opacity/.test(corpo));
  assert.deepEqual(comFade.map(([nome]) => nome), ["cl-pop", "cl-sobe", "cl-pulso"]);
  for (const [nome, corpo] of comFade) if (nome !== "cl-pulso") assert.match(corpo, /to\{opacity:1;/);
});

test("cor de paleta só por var(--…): hex literal só no verde do WhatsApp", () => {
  assert.deepEqual(hexLiterais(CSS_CLASSICO), ["#25D366", "#fff"]);
});

test("tudo que mexe fica em no-preference; o toque não depende da entrada", () => {
  const [antes, depois] = CSS_CLASSICO.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  assert.match(depois, /\.cl-btn:active,\.cl-btn\.lk-toque\{transform:scale\(\.97\)\}/);
  assert.match(depois, /\.cl-lista>li:nth-child\(2\)\{animation-delay:305ms\}/);
});

test("alvo de toque ≥ 44 px", () => {
  assert.match(CSS_CLASSICO, /\.cl-btn\{[^}]*min-height:64px/);
  assert.match(CSS_CLASSICO, /\.cl-mapa\{[^}]*min-height:48px/);
  assert.match(CSS_CLASSICO, /\.cl-copiar\{[^}]*min-height:44px/);
});

test("uma fonte: Manrope variável, com preload", () => {
  const html = pagina();
  assert.equal(html.match(/rel="preload"/g)?.length, 1);
  assert.match(html, /<link rel="preload" href="\/fonts\/bio\/manrope\/manrope-latin\.woff2" as="font" crossorigin>/);
  assert.match(html, /@font-face\{font-family:"Manrope";font-weight:200 800;font-display:swap;/);
});

test("o h1 é o nome em texto (a logo não entra), com o @ e a frase em <p> logo abaixo", () => {
  const html = pagina();
  assert.match(html, /<h1 class="cl-nome cl-sobe">Ateliê Exemplo Kids<\/h1><p class="cl-arroba cl-sobe">@atelie\.exemplo<\/p><p class="cl-frase cl-sobe">Kits de roupa infantil/);
  assert.doesNotMatch(html, /logo-(?:clara|escura)-falsa[^"]*"[^>]*alt=/);
});

test("botões em pílula: principal com o anel, catálogo com as capinhas e o endereço abre ali mesmo", () => {
  const html = pagina();
  assert.match(html, /<a class="cl-btn cl-btn--prin" href="https:\/\/wa\.me\/5562900000000\?text=[^"]+" data-link="[^"]+" data-tipo="whatsapp"><span class="cl-ico cl-ico--zap">/);
  assert.match(html, new RegExp(`<a class="cl-btn" href="https://exemplo\\.com\\.br/catalogo" data-link="${IDS.catalogo}" data-tipo="link"><span class="cl-capas" aria-hidden="true"><img src="[^"]*kit-1-falso[^"]*w=128&amp;q=75" width="30" height="30" alt="" loading="lazy"`));
  assert.match(html, /<details class="cl-abre"><summary class="cl-btn" data-link="[^"]+" data-tipo="endereco"><span class="cl-ico">/);
  assert.match(html, /<a class="cl-mapa" href="https:\/\/www\.google\.com\/maps\/[^"]+"><svg/);
  assert.match(html, /<footer class="cl-rodape"><small>Ateliê Exemplo Kids · CNPJ 11\.222\.333\/0001-81<\/small><a class="lk-feito"/);
});

test("o verde do WhatsApp vence o véu do principal: especificidade maior no ícone zap do principal", () => {
  /** Especificidade (ids, classes/pseudo-classes, tipos) de um seletor simples, sem :is/:where. */
  const especificidade = (s: string): number => {
    const ids = s.match(/#[\w-]+/g)?.length ?? 0;
    const classes = s.match(/\.[\w-]+|:(?!:)[\w-]+/g)?.length ?? 0;
    const tipos = s.replace(/[#.:][\w-]+|::[\w-]+/g, " ").match(/[a-z][\w-]*/gi)?.length ?? 0;
    return ids * 10000 + classes * 100 + tipos;
  };
  const seletores = (pedaco: RegExp) =>
    regras(CSS_CLASSICO).filter(([, d]) => pedaco.test(d)).flatMap(([s]) => s.split(",").map((x) => x.trim()));
  const veu = seletores(/background:rgb\(0 0 0 \/ \.12\)/).filter((s) => /\.cl-btn--prin/.test(s) && /\.cl-ico\b/.test(s));
  assert.ok(veu.length, "regra do véu do principal");
  const verde = seletores(/background:#25D366/).filter((s) => /\.cl-btn--prin/.test(s) && /\.cl-ico--zap/.test(s));
  assert.ok(verde.length, "regra do verde para o zap dentro do principal");
  const maxVerde = Math.max(...verde.map(especificidade));
  for (const s of veu) assert.ok(maxVerde > especificidade(s), `${verde.join(",")} × ${s}`);
});

test("as 3 capinhas cabem na coluna de 48 px do ícone, sem invadir o texto", () => {
  const coluna = Number(/\.cl-btn\{[^}]*grid-template-columns:(\d+)px /.exec(CSS_CLASSICO)?.[1]);
  const [, largura, recuo] = /\.cl-capas img\{width:(\d+)px;[^}]*margin-left:(-\d+)px\}/.exec(CSS_CLASSICO) ?? [];
  assert.ok(coluna && largura && recuo);
  assert.ok(3 * Number(largura) + 2 * Number(recuo) <= coluna, `${largura}px × 3 com ${recuo}px em ${coluna}px`);
});

test("o escalonamento da entrada conta só os .cl-sobe: sem foto ou sem @ não escorrega", () => {
  assert.doesNotMatch(CSS_CLASSICO, /\.cl-sobe:nth-child/);
  assert.match(CSS_CLASSICO, /\.lk-entra \.cl-sobe\+\.cl-sobe\{animation-delay:60ms\}/);
  assert.match(CSS_CLASSICO, /\.lk-entra \.cl-sobe\+\.cl-sobe\+\.cl-sobe\{animation-delay:120ms\}/);
  assert.match(CSS_CLASSICO, /\.lk-entra \.cl-sobe\+\.cl-sobe\+\.cl-sobe\+\.cl-sobe\{animation-delay:180ms\}/);
  // os .cl-sobe vêm sempre seguidos depois do h1 (a foto, quando existe, vem antes dele)
  assert.match(pagina({ capa: null, instagram: "" }), /<main class="cl"><div class="cl-col"><h1 class="cl-nome cl-sobe">[^<]*<\/h1><p class="cl-frase cl-sobe">/);
});
