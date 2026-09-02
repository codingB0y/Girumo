import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, deriveDarkPalette, parseHex } from "./palette";

const BG = "#0f1418";

test("a brand that already reads on dark stays as-is", () => {
  const p = deriveDarkPalette("#A7FF2F", BG);
  assert.ok(p);
  assert.equal(p.adjusted, false);
  assert.equal(p.accent, "#a7ff2f");
});

test("a dark brand is lightened until it reads 4.5:1 on the dark background", () => {
  const p = deriveDarkPalette("#6d2436", BG);
  assert.ok(p);
  assert.equal(p.adjusted, true);
  const accent = parseHex(p.accent);
  const bg = parseHex(BG);
  assert.ok(accent && bg);
  assert.ok(contrastRatio(accent, bg) >= 4.5);
  assert.match(p.reason ?? "", /clareada/);
});

test("invalid hex yields null", () => {
  assert.equal(deriveDarkPalette("verde", BG), null);
});
