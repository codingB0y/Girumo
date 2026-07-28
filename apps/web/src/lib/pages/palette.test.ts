import assert from "node:assert/strict";
import { parseHex, contrastRatio, derivePalette } from "./palette";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

// parseHex — 6 dígitos, atalho de 3, com/sem '#', case-insensitive
assert.deepEqual(parseHex("#ff8800"), { r: 255, g: 136, b: 0 });
assert.deepEqual(parseHex("#f80"), { r: 255, g: 136, b: 0 });
assert.deepEqual(parseHex("FF8800"), { r: 255, g: 136, b: 0 });
assert.equal(parseHex("#ff88"), null);
assert.equal(parseHex("#gggggg"), null);
assert.equal(parseHex(""), null);

// razões de contraste WCAG conhecidas
assert.ok(Math.abs(contrastRatio(WHITE, BLACK) - 21) < 0.05);
assert.ok(Math.abs(contrastRatio(WHITE, WHITE) - 1) < 0.001);

// marca clara (amarelo) → precisa escurecer pra virar texto legível sobre fundo claro
const yellow = derivePalette("#ffd400");
assert.ok(yellow);
assert.equal(yellow!.adjusted, true);
assert.ok(contrastRatio(parseHex(yellow!.accent)!, WHITE) >= 4.5);
assert.equal(yellow!.onBrand, "#111827"); // texto escuro sobre amarelo
assert.ok(yellow!.reason && yellow!.reason.length > 0);

// marca escura (navy) → já passa; sem ajuste; texto branco sobre ela
const navy = derivePalette("#1a1a2e");
assert.ok(navy);
assert.equal(navy!.adjusted, false);
assert.equal(navy!.accent, "#1a1a2e");
assert.equal(navy!.onBrand, "#ffffff");
assert.ok(contrastRatio(parseHex(navy!.accent)!, WHITE) >= 4.5);

// hex inválido → null
assert.equal(derivePalette("nope"), null);

console.log("palette tests passed");
