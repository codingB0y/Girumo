import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoFalso } from "@/test/bio-dados-falsos";
import {
  atrasos,
  classeDoFoco,
  destaqueEmPartes,
  destaqueHtml,
  formatarCnpj,
  icone,
  imagem,
  logoDaPagina,
  pontoDoFoco,
  regrasDoFoco,
  sprite,
  tokensValidos,
  urlDaImagem,
} from "./partes";

test("imagem: srcset 384/640/828 pelo otimizador, src de 640, & escapado", () => {
  const html = imagem({ id: "capa-falsa", foco: null }, { largura: 640, altura: 512, sizes: "100vw", alt: "Fachada", carregamento: "prioridade" });
  assert.match(html, /src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=640&amp;q=75"/);
  assert.match(html, /srcset="[^"]*w=384&amp;q=75 384w, [^"]*w=640&amp;q=75 640w, [^"]*w=828&amp;q=75 828w"/);
  assert.match(html, /sizes="100vw" width="640" height="512" alt="Fachada" fetchpriority="high" decoding="async">/);
  assert.doesNotMatch(html, /loading=/);
});

test("imagem: miniatura com uma largura só, lazy, sem srcset", () => {
  const html = imagem({ id: "kit", foco: null }, { largura: 32, altura: 42, sizes: "32px", alt: "", carregamento: "lazy", larguras: [128] });
  assert.match(html, /src="[^"]*w=128&amp;q=75"/);
  assert.doesNotMatch(html, /srcset|sizes=/);
  assert.match(html, /alt="" loading="lazy"/);
});

test("imagem: id fora do formato não vira <img>", () => {
  assert.equal(imagem({ id: "../x", foco: null }, { largura: 1, altura: 1, sizes: "1px", alt: "", carregamento: "lazy" }), "");
  assert.equal(urlDaImagem('a"b', 384), null);
});

test("foco: porcentagem inteira, classe e regra com object-position e transform-origin", () => {
  assert.deepEqual(pontoDoFoco({ x: 0.375, y: 0.2 }), { x: 38, y: 20 });
  assert.deepEqual(pontoDoFoco({ x: 7, y: -1 }), { x: 100, y: 0 });
  assert.equal(pontoDoFoco(null), null);
  assert.equal(pontoDoFoco({ x: Number.NaN, y: 0.5 }), null);
  assert.equal(classeDoFoco({ x: 0.375, y: 0.2 }), "lk-f-38-20");
  assert.equal(classeDoFoco(null), "");
  const regras = regrasDoFoco(documentoFalso());
  assert.match(regras, /\.lk \.lk-f-38-20\{object-position:38% 20%;transform-origin:38% 20%\}/);
  assert.match(regras, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.equal(regras.match(/lk-f-/g)?.length, 2);
});

test("ícone decorativo e sprite só com o que a página usa", () => {
  assert.equal(icone("coroa"), '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#lk-i-coroa"></use></svg>');
  assert.match(icone("nao-existe"), /#lk-i-link/);
  const s = sprite(`${icone("coroa")}${icone("seta", "i et-seta")}${icone("coroa")}`);
  assert.match(s, /^<svg class="lk-sprite" aria-hidden="true" focusable="false">/);
  assert.equal(s.match(/<symbol /g)?.length, 2);
  assert.match(s, /id="lk-i-coroa"/);
  assert.equal(sprite("<p>sem ícone</p>"), "");
  assert.equal(sprite("#lk-i-constructor"), "");
});

test("destaque: só o primeiro número (ou R$) vai em <b>", () => {
  assert.deepEqual(destaqueEmPartes("a partir de R$ 19,90 a peça"), { antes: "a partir de ", num: "R$ 19,90", depois: " a peça" });
  assert.deepEqual(destaqueEmPartes("12 kits no catálogo"), { antes: "", num: "12", depois: " kits no catálogo" });
  assert.deepEqual(destaqueEmPartes("frete grátis acima de 1.000."), { antes: "frete grátis acima de ", num: "1.000", depois: "." });
  assert.deepEqual(destaqueEmPartes("envio pro Brasil inteiro"), { antes: "envio pro Brasil inteiro", num: "", depois: "" });
  assert.equal(destaqueHtml("<b>3</b> kits"), "&lt;b&gt;<b>3</b>&lt;/b&gt; kits");
});

test("CNPJ: numérico ou alfanumérico com pontuação; o resto volta como veio", () => {
  assert.equal(formatarCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarCnpj("12ABC34501DE35"), "12.ABC.345/01DE-35");
  assert.equal(formatarCnpj("123"), "123");
});

test("logo: a certa para o fundo; só a errada vai numa placa", () => {
  const doc = documentoFalso();
  const escuro = "#286AA6";
  const claro = "#F4F7FB";
  assert.deepEqual(logoDaPagina(doc, escuro), { midia: doc.perfil.logoClara, placa: null });
  assert.deepEqual(logoDaPagina(doc, claro), { midia: doc.perfil.logoEscura, placa: null });
  const soEscura = { ...doc, perfil: { ...doc.perfil, logoClara: null } };
  assert.deepEqual(logoDaPagina(soEscura, escuro), { midia: doc.perfil.logoEscura, placa: "clara" });
  const soClara = { ...doc, perfil: { ...doc.perfil, logoEscura: null } };
  assert.deepEqual(logoDaPagina(soClara, claro), { midia: doc.perfil.logoClara, placa: "escura" });
  const semLogo = { ...doc, perfil: { ...doc.perfil, logoClara: null, logoEscura: null } };
  assert.equal(logoDaPagina(semLogo, escuro), null);
});

test("tokens: só --nome com #RRGGBB vão para o <style>", () => {
  assert.deepEqual(
    tokensValidos({ "--fundo1": "#3a80bf", on: "#FFFFFF", "--x": "red", "--y": "#FFF;}body{x:1", "--Z": "#000000" }),
    { "--fundo1": "#3A80BF", "--on": "#FFFFFF" },
  );
});

test("atrasos de entrada por :nth-child, até 20 links", () => {
  const css = atrasos(".x>li", 0, 70);
  assert.doesNotMatch(css, /nth-child\(1\)/);
  assert.match(css, /\.x>li:nth-child\(2\)\{animation-delay:70ms\}/);
  assert.match(css, /\.x>li:nth-child\(20\)\{animation-delay:1330ms\}/);
  assert.doesNotMatch(css, /nth-child\(21\)/);
  assert.match(atrasos(".y>li", 350, 60), /\.y>li:nth-child\(1\)\{animation-delay:350ms\}/);
});
