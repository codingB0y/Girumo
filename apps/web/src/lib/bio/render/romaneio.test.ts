import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo, type TokensBio } from "@/lib/bio/cores";
import { PALETAS, type DadosRender, type DocumentoBio } from "@/lib/bio/documento";
import { falhas, hexLiterais, keyframes, regras, sorteio, variaveisLidas, type Par } from "@/test/bio-contraste";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { CSS_BASE, tokensValidos } from "./partes";
import { CSS_ROMANEIO } from "./romaneio";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const tokens = (paleta: string, cores: DocumentoBio["cores"] = null) => tokensValidos(coresDoModelo("romaneio", paleta, cores));
const pagina = (perfil: Partial<DocumentoBio["perfil"]> = {}): string => {
  const d: DadosRender = dadosFalsos();
  const documento = { ...d.documento, modelo: "romaneio" as const, paleta: "kraft", perfil: { ...d.documento.perfil, ...perfil } };
  return renderPaginaBio({ ...d, documento }, { modo: "publica", nonce: NONCE, animarEntrada: true });
};

/** Todo par de cor que o CSS do Romaneio desenha: no papel, e fora dele sobre o degradê fundo1–fundo3. */
function pares(t: TokensBio): Par[] {
  const c = (nome: string) => t[`--${nome}`];
  return [
    [c("tinta"), c("papel"), 4.5, "itens, h1, frase, CNPJ, linha tocada (invertida) e o aviso #lk-status"],
    [c("tinta2"), c("papel"), 4.5, "número, subtítulo, onde fica, horário e rótulo"],
    [c("acento"), c("papel"), 4.5, "carimbo"],
    [c("on2"), c("fundo2"), 4.5, "Feito com Girumo (o selo leva o fundo2 atrás)"],
    [c("foco"), c("papel"), 3, "anel de foco no papel"],
    [c("foco-fora"), c("fundo1"), 3, "anel de foco fora do papel (fundo1)"],
    [c("foco-fora"), c("fundo2"), 3, "anel de foco fora do papel (fundo2)"],
    [c("foco-fora"), c("fundo3"), 3, "anel de foco fora do papel (fundo3)"],
  ];
}

test("as 4 paletas do Romaneio passam em todo par, inclusive os dois anéis de foco", () => {
  for (const paleta of PALETAS.romaneio) assert.deepEqual(falhas(pares(tokens(paleta))), [], paleta);
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
  const usadas = variaveisLidas(`${CSS_BASE}${CSS_ROMANEIO}`);
  assert.ok(usadas.includes("foco-fora"));
  for (const paleta of [...PALETAS.romaneio, "marca"]) {
    const t = tokens(paleta, paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null);
    assert.deepEqual(usadas.filter((v) => !(`--${v}` in t)), [], paleta);
  }
});

test("a serrilha fica no ::before do papel e o papel impresso não guarda clip-path: o anel de foco nunca é cortado", () => {
  const comMascara = regras(CSS_ROMANEIO).filter(([, d]) => /(?:^|;)(?:-webkit-)?mask/.test(d)).map(([s]) => s);
  assert.deepEqual(comMascara, [".rm-papel::before"]);
  assert.deepEqual(regras(CSS_ROMANEIO).filter(([, d]) => /clip-path/.test(d)), []);
  assert.match(CSS_ROMANEIO, /\.lk-entra \.rm-papel\{animation:rm-imprime 1\.2s [^}]* backwards\}/);
});

test("fora do papel o anel é --foco-fora; dentro, o --foco do CSS base", () => {
  assert.match(CSS_ROMANEIO, /\.rm-fora :focus-visible\{outline-color:var\(--foco-fora\)\}/);
  const trocas = regras(CSS_ROMANEIO).filter(([, d]) => /outline/.test(d)).map(([s]) => s);
  assert.deepEqual(trocas, [".rm-fora :focus-visible"]);
  assert.match(CSS_ROMANEIO, /\.rm-fora \.lk-feito\{background:var\(--fundo2\)\}/);
});

test("nada de opacity em texto: só o filete do carimbo e as entradas, que terminam em 1", () => {
  assert.deepEqual(regras(CSS_ROMANEIO).filter(([, d]) => /opacity/.test(d)).map(([s]) => s), [".rm-carimbo::before"]);
  const comFade = Object.entries(keyframes(CSS_ROMANEIO)).filter(([, corpo]) => /opacity/.test(corpo));
  assert.deepEqual(comFade.map(([nome]) => nome), ["rm-linha", "rm-carimba"]);
  for (const [, corpo] of comFade) assert.match(corpo, /(?:to|100%)\{opacity:1;/);
});

test("cor de paleta só por var(--…): hex literal só na máscara da serrilha", () => {
  assert.deepEqual(hexLiterais(CSS_ROMANEIO), ["#000", "#0000"]);
});

test("tudo que mexe fica em no-preference; o carimbo da entrada (no <li>) não briga com o do toque (no <a>)", () => {
  const [antes, depois] = CSS_ROMANEIO.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  const entrada = depois.indexOf(".lk-entra .rm-itens>li.rm-li-prin{animation:rm-carimba .55s 1.15s");
  assert.ok(entrada > depois.indexOf(".rm-itens>li:nth-child(20){animation-delay:2070ms}"), "depois dos atrasos");
  assert.match(depois, /\.rm-carimbo\.lk-toque\{animation:rm-recarimba \.5s/);
});

test("alvo de toque ≥ 44 px", () => {
  assert.match(CSS_ROMANEIO, /\.rm-linha\{[^}]*min-height:58px/);
  assert.match(CSS_ROMANEIO, /\.rm-mapa\{[^}]*min-height:44px/);
  assert.match(CSS_ROMANEIO, /\.rm-copiar\{[^}]*min-height:44px/);
});

test("IBM Plex Mono nos 4 pesos, com preload, e nenhuma outra fonte", () => {
  const html = pagina();
  assert.equal(html.match(/rel="preload"/g)?.length, 4);
  assert.equal(html.match(/@font-face/g)?.length, 4);
  for (const peso of ["400", "500", "600", "700"]) {
    assert.ok(html.includes(`<link rel="preload" href="/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-${peso}.woff2" as="font" type="font/woff2" crossorigin>`), peso);
    assert.ok(html.includes(`@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:${peso};font-display:swap;`), peso);
  }
});

test("topo: h1 = nome (a logo escura no papel claro), frase e onde fica em <p>, sem a foto", () => {
  const html = pagina();
  assert.match(html, /<header class="rm-topo"><h1 class="rm-nome"><img class="rm-logo" src="[^"]*logo-escura-falsa[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/h1><p class="rm-frase">Kits de roupa infantil[^<]*<\/p><p class="rm-local">Loja na Rua Exemplo/);
  assert.doesNotMatch(html, /capa-falsa[^"]*"[^>]*fetchpriority|<img [^>]*fetchpriority/);
  assert.match(pagina({ logoClara: null, logoEscura: null }), /<h1 class="rm-nome">Ateliê Exemplo Kids<\/h1>/);
});

test("itens: o principal é o carimbo sem número; os outros 01, 02… com número, rótulo, pontilhado e seta fora da árvore", () => {
  const html = pagina();
  assert.match(html, /<p class="rm-rotulo" aria-hidden="true"><span>Item<\/span><span>Abrir<\/span><\/p><ul class="rm-itens" aria-label="Links da Ateliê Exemplo Kids"><li class="rm-li-prin"><a class="rm-carimbo" href="https:\/\/wa\.me\//);
  assert.match(html, new RegExp(`<a class="rm-linha" href="https://exemplo\\.com\\.br/catalogo" data-link="${IDS.catalogo}" data-tipo="link"><span class="rm-n" aria-hidden="true">01</span><span class="rm-t">Catálogo de kits</span><span class="rm-pontos" aria-hidden="true"></span><span class="rm-seta" aria-hidden="true">→</span><span class="rm-sub">`));
  assert.match(html, /<span class="rm-mini" aria-hidden="true"><img src="[^"]*kit-1-falso[^"]*w=128&amp;q=75" width="38" height="46" alt="" loading="lazy"/);
  assert.deepEqual([...html.matchAll(/<span class="rm-n" aria-hidden="true">(\d+)<\/span>/g)].map((m) => m[1]), ["01", "02", "03", "04"]);
  assert.match(html, new RegExp(`<details class="rm-abre"><summary class="rm-linha" data-link="${IDS.endereco}" data-tipo="endereco"><span class="rm-n" aria-hidden="true">03</span><span class="rm-t">Como chegar na loja</span><span class="rm-pontos" aria-hidden="true"></span><span class="rm-seta" aria-hidden="true">↓</span>`));
  assert.match(html, /<a class="rm-mapa" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=[^"]+">Abrir no Google Maps <span aria-hidden="true">→<\/span><\/a>/);
  for (const hr of html.match(/<hr[^>]*>/g) ?? []) assert.equal(hr, '<hr class="rm-corte" aria-hidden="true">');
});

test("confere com travessão e Copiar CNPJ; a nota fecha com código de barras decorativo, @ e CNPJ", () => {
  const html = pagina();
  assert.match(html, /<section class="rm-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere<\/h2><ul><li><span aria-hidden="true">—<\/span><span>Pix só no nome <b>Ateliê Exemplo Comércio de Roupas Ltda<\/b><span class="rm-cnpj"><span>CNPJ 11\.222\.333\/0001-81<\/span><button type="button" class="rm-copiar" data-copiar="11222333000181">Copiar CNPJ<\/button><\/span><\/span><\/li><li><span aria-hidden="true">—<\/span><span>Na primeira compra/);
  assert.match(html, /<footer class="rm-fim"><strong>Obrigado pela preferência<\/strong><span class="rm-barras" aria-hidden="true"><\/span><span>@atelie\.exemplo<\/span><span>CNPJ 11\.222\.333\/0001-81<\/span><\/footer><\/article><\/div><footer class="rm-fora"><a class="lk-feito"/);
  const d = dadosFalsos();
  const semConfere = renderPaginaBio(
    { ...d, documento: { ...d.documento, modelo: "romaneio", paleta: "kraft", feitoComGirumo: false, confere: { ...d.documento.confere, ativo: false } } },
    { modo: "publica", nonce: NONCE, animarEntrada: true },
  );
  assert.doesNotMatch(semConfere, /class="rm-confere"|CNPJ \d|class="rm-fora"/);
  assert.match(semConfere, /<footer class="rm-fim"><strong>Obrigado pela preferência<\/strong>/);
});

test("o carimbo da entrada (scale 1.7) não rola a página de lado: o .rm corta o x", () => {
  assert.match(CSS_ROMANEIO, /\.rm\{[^}]*overflow-x:clip/);
});
