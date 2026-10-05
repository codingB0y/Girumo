import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Tema do painel (spec 2026-10-05, decisões 1 e 2): claro e frio, pela camada
 * de tokens, e com as fontes da raiz. Lê o CSS direto: o tema não tem função.
 */
const css = readFileSync(path.join(process.cwd(), "src", "app", "painel-vitrine.css"), "utf8");
const bloco = css.match(/:root:has\(\.pn-root\)\s*\{([^}]*)\}/)?.[1] ?? "";

test("o painel é claro e frio: fundo e superfície do G2, tinta volt da raiz", () => {
  assert.match(bloco, /color-scheme:\s*light/);
  assert.match(bloco, /--color-canvas-100:\s*#F3F5F7/i);
  assert.match(bloco, /--color-paper-0:\s*#FFFFFF/i);
  assert.match(bloco, /--color-line-200:\s*#DDE3E7/i);
  assert.doesNotMatch(bloco, /--color-volt-950|--color-slate-600/);
});

test("nada da noite sobrou: um bloco só, sem cor escura, sem tinta trocada, sem Archivo", () => {
  assert.equal(css.match(/:root:has\(\.pn-root\)\s*\{/g)?.length, 1);
  assert.doesNotMatch(css, /color-scheme:\s*dark|--color-(volt-950|slate-600)\s*:/);
  assert.doesNotMatch(css, /#061620|#0B2230|#E9F1F3|#16384A/i);
  assert.doesNotMatch(css, /--font-painel/);
});
