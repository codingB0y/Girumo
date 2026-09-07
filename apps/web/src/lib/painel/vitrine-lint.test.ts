import assert from "node:assert/strict";
import { test } from "node:test";

import { lintPainelSource } from "./vitrine-lint";

test("fonte limpa não gera achado", () => {
  const source = `<div className="rounded-xl bg-acid-500 hover:bg-acid-400 not-italic">ok</div>`;
  assert.deepEqual(lintPainelSource("a.tsx", source), []);
});

test("aponta cada token proibido com linha", () => {
  const source = [
    `<div className="rounded-2xl">`,
    `<div className="rounded-3xl">`,
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
  const dois = `bg-acid-500 hover:bg-acid-400\nbg-acid-500 focus:bg-acid-500`;
  assert.deepEqual(lintPainelSource("ok.tsx", dois), []);
  const tres = `bg-acid-500\nbg-acid-500\nbg-acid-500`;
  const findings = lintPainelSource("demais.tsx", tres);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /3 fundos Acid/);
});
