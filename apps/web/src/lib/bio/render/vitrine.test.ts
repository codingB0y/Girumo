import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo, type TokensBio } from "@/lib/bio/cores";
import { PALETAS, type DadosRender, type DocumentoBio } from "@/lib/bio/documento";
import { falhas, hexLiterais, keyframes, mistura, razao, regras, sorteio, variaveisLidas, type Par } from "@/test/bio-contraste";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { CSS_BASE, tokensValidos } from "./partes";
import { CSS_VITRINE } from "./vitrine";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const tokens = (paleta: string, cores: DocumentoBio["cores"] = null) => tokensValidos(coresDoModelo("vitrine", paleta, cores));
const pagina = (perfil: Partial<DocumentoBio["perfil"]> = {}): string => {
  const d: DadosRender = dadosFalsos();
  const documento = { ...d.documento, modelo: "vitrine" as const, paleta: "papel", perfil: { ...d.documento.perfil, ...perfil } };
  return renderPaginaBio({ ...d, documento }, { modo: "publica", nonce: NONCE, animarEntrada: true });
};

/** Todo par de cor que o CSS do Vitrine desenha (o texto na foto tem véu fixo: teste à parte). */
function pares(t: TokensBio): Par[] {
  const c = (nome: string) => t[`--${nome}`];
  return [
    [c("on"), c("fundo2"), 4.5, "título, endereço e Abrir no Google Maps na folha"],
    [c("on2"), c("fundo2"), 4.5, "subtítulo, destaques, horário e rodapé"],
    [c("acento"), c("fundo2"), 4.5, "número do destaque"],
    [c("seta"), c("fundo2"), 3, "seta"],
    [c("ico"), c("icobg"), 3, "ícone do quadrado"],
    [c("printinta"), c("prin"), 4.5, "botão principal"],
    [c("printinta"), mistura(c("prin"), "#FFFFFF", 0.14), 3, "ícone do principal (véu branco de 14%)"],
    [c("tinta"), c("papel"), 4.5, "confere, Copiar CNPJ, anel de foco no confere e o aviso #lk-status"],
    [c("acento"), c("papel"), 4.5, "título e ícones do confere"],
    [c("foco"), c("fundo2"), 3, "anel de foco na folha"],
  ];
}

test("as 4 paletas do Vitrine passam em todo par que o modelo desenha", () => {
  for (const paleta of PALETAS.vitrine) assert.deepEqual(falhas(pares(tokens(paleta))), [], paleta);
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
  const usadas = variaveisLidas(`${CSS_BASE}${CSS_VITRINE}`);
  assert.ok(usadas.length >= 12);
  for (const paleta of [...PALETAS.vitrine, "marca"]) {
    const t = tokens(paleta, paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null);
    assert.deepEqual(usadas.filter((v) => !(`--${v}` in t)), [], paleta);
  }
});

test("texto em cima da foto: véu fixo de .62, branco com 6:1 em qualquer foto", () => {
  assert.match(CSS_VITRINE, /\.vt-onde\{[^}]*background:rgb\(0 0 0 \/ \.62\)/);
  assert.match(CSS_VITRINE, /\.vt-marca::before\{[^}]*rgb\(0 0 0 \/ \.62\) 56px\)/);
  assert.match(CSS_VITRINE, /\.vt-marca\{[^}]*padding:56px 6px 0/);
  assert.ok(razao("#FFFFFF", mistura("#FFFFFF", "#000000", 0.62)) >= 6);
});

test("topo com min-height e o texto no fluxo: zoom de 200% não corta", () => {
  const capa = regras(CSS_VITRINE).find(([s]) => s === ".vt-capa")?.[1] ?? "";
  assert.doesNotMatch(capa, /(?:^|;)height:/);
  assert.match(CSS_VITRINE, /\.vt-capa--foto\{min-height:520px\}/);
  const absolutos = regras(CSS_VITRINE).filter(([, d]) => /position:absolute/.test(d)).map(([s]) => s);
  assert.deepEqual(absolutos, [".vt-capa>img", ".vt-marca::before", ".vt-prin::before,.vt-prin::after"]);
});

test("nada de opacity em texto: só as entradas fazem fade, e terminam em 1", () => {
  assert.deepEqual(regras(CSS_VITRINE).filter(([, d]) => /opacity/.test(d)), []);
  const comFade = Object.entries(keyframes(CSS_VITRINE)).filter(([, corpo]) => /opacity/.test(corpo));
  assert.deepEqual(comFade.map(([nome]) => nome), ["vt-ergue", "vt-entra"]);
  for (const [, corpo] of comFade) assert.match(corpo, /to\{opacity:1;/);
});

test("cor de paleta só por var(--…): hex literal só no topo escuro e no verde do WhatsApp", () => {
  assert.deepEqual(hexLiterais(CSS_VITRINE), ["#151412", "#25D366", "#fff"]);
});

test("tudo que mexe fica em no-preference; o brilho do toque não é o da entrada", () => {
  const [antes, depois] = CSS_VITRINE.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  assert.match(depois, /\.lk-entra \.vt-prin::after\{animation:vt-brilho 1\.3s 1\.25s/);
  assert.match(depois, /\.vt-prin\.lk-toque::before\{animation:vt-brilho \.9s/);
  assert.match(depois, /\.vt-lista>li:nth-child\(2\)\{animation-delay:410ms\}/);
});

test("alvo de toque ≥ 44 px", () => {
  assert.match(CSS_VITRINE, /\.vt-prin\{[^}]*min-height:66px/);
  assert.match(CSS_VITRINE, /\.vt-linha\{[^}]*min-height:82px/);
  assert.match(CSS_VITRINE, /\.vt-mapa\{[^}]*min-height:50px/);
  assert.match(CSS_VITRINE, /\.vt-copiar\{[^}]*min-height:44px/);
});

test("duas famílias, três arquivos: Jost variável e Bodoni Moda 600 e 500 itálico, com preload", () => {
  const html = pagina();
  assert.equal(html.match(/rel="preload"/g)?.length, 3);
  for (const arquivo of ["jost/jost-latin.woff2", "bodoni-moda/bodoni-moda-latin-600.woff2", "bodoni-moda/bodoni-moda-latin-500-italic.woff2"]) {
    assert.ok(html.includes(`<link rel="preload" href="/fonts/bio/${arquivo}" as="font" crossorigin>`), arquivo);
  }
  assert.match(html, /@font-face\{font-family:"Bodoni Moda";font-style:italic;font-weight:500;font-display:swap;src:url\(\/fonts\/bio\/bodoni-moda\/bodoni-moda-latin-500-italic\.woff2\)\}/);
  assert.match(html, /\.lk\{font-family:"Jost"/);
});

test("topo: foto com prioridade, 'onde fica', logo clara no h1 e a frase em <p>", () => {
  const html = pagina();
  assert.match(html, /<header class="vt-capa vt-capa--foto"><img class="lk-f-50-30" src="[^"]*capa-falsa[^"]*" srcset="[^"]*384w[^"]*640w[^"]*828w" sizes="\(max-width: 520px\) 100vw, 520px" width="640" height="800" alt="Fachada da loja de exemplo" fetchpriority="high" decoding="async">/);
  assert.match(html, /<p class="vt-onde"><svg[^>]*><use href="#i-mapa"\/><\/svg><span>Loja na Rua Exemplo/);
  assert.match(html, /<div class="vt-marca"><h1 class="vt-nome"><img class="vt-logo" src="[^"]*logo-clara-falsa[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/h1><p class="vt-frase">Kits de roupa infantil/);
  assert.match(html, /<meta name="theme-color" content="#151412">/);
});

test("sem foto o topo não tem min-height; sem logo o h1 é o nome; só a logo escura vai numa placa", () => {
  const sem = pagina({ capa: null, logoClara: null, logoEscura: null });
  assert.match(sem, /<header class="vt-capa"><p class="vt-onde">/);
  assert.match(sem, /<h1 class="vt-nome">Ateliê Exemplo Kids<\/h1>/);
  assert.doesNotMatch(sem, /fetchpriority/);
  assert.match(pagina({ logoClara: null }), /<h1 class="vt-nome"><span class="lk-placa"><img class="vt-logo" src="[^"]*logo-escura-falsa/);
});

test("lista: o principal é a pílula (WhatsApp verde), o catálogo leva as fotos e o endereço abre ali mesmo", () => {
  const html = pagina();
  assert.match(html, /<li class="vt-li-prin"><a class="vt-prin" href="https:\/\/wa\.me\/5562900000000\?text=[^"]+" data-link="[^"]+" data-tipo="whatsapp"><span class="vt-zap vt-zap--wa"><svg/);
  assert.match(html, new RegExp(`<a class="vt-linha" href="https://exemplo\\.com\\.br/catalogo" data-link="${IDS.catalogo}" data-tipo="link"><span class="vt-tile">`));
  assert.match(html, /<span class="vt-fotos" aria-hidden="true"><img src="[^"]*kit-1-falso[^"]*w=384&amp;q=75" alt="" loading="lazy" decoding="async">/);
  assert.match(html, /<details class="vt-abre"><summary class="vt-linha" data-link="[^"]+" data-tipo="endereco"><span class="vt-tile">/);
  assert.match(html, /<div class="vt-caminho"><img src="[^"]*fachada-falsa[^"]*"[^>]*sizes="\(max-width: 520px\) calc\(100vw - 44px\), 476px" width="640" height="400" alt="" loading="lazy"/);
  assert.match(html, /<footer class="vt-rodape"><span>Instagram @atelie\.exemplo<\/span><small>Ateliê Exemplo Kids · CNPJ 11\.222\.333\/0001-81<\/small><a class="lk-feito"/);
});

/** Especificidade (b, c) de um seletor simples: classes, atributos e pseudo-classes; tipos. */
function especificidade(seletor: string): number {
  const b = (seletor.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const c = (seletor.replace(/\[[^\]]+\]|[.:#][\w-]+/g, " ").match(/[a-z][\w-]*/gi) ?? []).length;
  return b * 100 + c;
}

test("'Como chegar' aberto: a seta girada vence o toque e o hover, que também mexem nela", () => {
  const naSeta = regras(CSS_VITRINE)
    .filter(([s, d]) => /\.vt-linha(:[a-z]+|\.lk-toque)?>svg/.test(s) && /transform:/.test(d))
    .flatMap(([s]) => s.split(","));
  const aberta = naSeta.filter((s) => /\[open\]/.test(s));
  const outras = naSeta.filter((s) => !/\[open\]/.test(s));
  assert.equal(aberta.length, 1);
  assert.ok(outras.length >= 3);
  for (const s of outras) assert.ok(especificidade(aberta[0]) > especificidade(s), `${aberta[0]} não vence ${s}`);
});
