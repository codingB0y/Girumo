import assert from "node:assert/strict";
import { test } from "node:test";

import { lintPainelSource, onlyPnBlocks } from "./vitrine-lint";

test("fonte limpa não gera achado", () => {
  const source = `<div className="rounded-xl bg-acid-500 hover:bg-acid-400 not-italic">ok</div>`;
  assert.deepEqual(lintPainelSource("a.tsx", source), []);
});

test("aponta cada token proibido com linha", () => {
  const source = [
    `<div className="rounded-2xl">`,
    `<div className="sm:rounded-t-3xl">`,
    `<div className="backdrop-blur-sm">`,
    `<div className="blur-[80px]">`,
    `<div className="bg-gradient-to-r">`,
    `<Sparkles />`,
    `<span className="animate-confetti-fall">`,
    `<p className="font-editorial italic">`,
    `<p className="text-purple-400">`,
  ].join("\n");
  const findings = lintPainelSource("x.tsx", source);
  const lines = findings.map((f) => Number(f.split(":")[1]));
  assert.deepEqual(lines, [1, 2, 3, 4, 5, 6, 7, 8, 8, 9]);
  assert.ok(findings.every((f) => f.startsWith("x.tsx:")));
});

test("CSS: font-style italic e gradiente também contam", () => {
  const source = `.pn-carimbo { font-style: italic; }\n.x { background: linear-gradient(red, blue); }`;
  assert.equal(lintPainelSource("v.css", source).length, 2);
});

test("Acid em fundo: até dois por arquivo, variantes de estado não contam", () => {
  const dois = `bg-acid-500 hover:bg-acid-400\nbg-acid-500 focus:bg-acid-500 group-hover:bg-acid-500`;
  assert.deepEqual(lintPainelSource("ok.tsx", dois), []);
  const tres = `bg-acid-500\nbg-acid-500\nbg-acid-500`;
  const findings = lintPainelSource("demais.tsx", tres);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /3 fundos Acid/);
});

test("Acid em fundo: variantes de tamanho e tema contam como fundo", () => {
  const source = `bg-acid-500\nmd:bg-acid-500\ndark:bg-acid-500`;
  assert.match(lintPainelSource("resp.tsx", source)[0], /3 fundos Acid/);
});

test("onlyPnBlocks mantém só regras .pn-* e preserva as linhas", () => {
  const css = `.hf-glow {\n  filter: blur(6px);\n}\n.pn-carimbo {\n  font-style: italic;\n}\n`;
  const filtered = onlyPnBlocks(css);
  assert.equal(filtered.split("\n").length, css.split("\n").length);
  assert.deepEqual(lintPainelSource("globals.css", filtered), ["globals.css:5: italic (itálico editorial)"]);
});

test("esqueleto: exige role=status ou aria-hidden, e só em .tsx", () => {
  const mudo = `<div className="pn-skeleton h-40 rounded-xl" />`;
  const achados = lintPainelSource("tela.tsx", mudo);
  assert.equal(achados.length, 1);
  assert.match(achados[0], /pn-skeleton sem role="status" nem aria-hidden/);

  const anunciado = `<div role="status" aria-label="Carregando">\n  <div className="pn-skeleton h-40" />\n</div>`;
  assert.deepEqual(lintPainelSource("tela.tsx", anunciado), []);

  const decorativo = `<span className="pn-skeleton h-4" aria-hidden="true" />`;
  assert.deepEqual(lintPainelSource("tela.tsx", decorativo), []);

  // No CSS `.pn-skeleton` é a DEFINIÇÃO da classe: cobrar anúncio ali
  // deixaria o gate vermelho para sempre, sem nada a corrigir.
  const css = `.pn-skeleton { background: var(--color-canvas-100); }`;
  assert.deepEqual(lintPainelSource("painel-vitrine.css", css), []);
});

test("esqueleto: a conta é por ocorrência, não por arquivo", () => {
  // Um marcado e outro mudo no mesmo arquivo: o mudo tem que aparecer. Era o
  // falso negativo do proxy por arquivo — foi assim que um `role="status"` por
  // linha de lista passou pelo gate.
  const misto = [
    `<div role="status" aria-label="Carregando"><div className="pn-skeleton h-40" /></div>`,
    ...Array(30).fill("// separa as duas ocorrências para além do alcance da vizinhança"),
    `<span className="pn-skeleton h-4" />`,
  ].join("\n");
  const achados = lintPainelSource("misto.tsx", misto);
  assert.equal(achados.length, 1);
  assert.match(achados[0], /:32: pn-skeleton sem/);

  // `aria-hidden` de ícone decorativo em outro canto não vale como marcação.
  const iconeLonge = [
    `<Check aria-hidden="true" />`,
    ...Array(30).fill("// um ícone decorativo não diz nada sobre o esqueleto lá embaixo"),
    `<div className="pn-skeleton h-40" />`,
  ].join("\n");
  assert.equal(lintPainelSource("icone.tsx", iconeLonge).length, 1);
});
