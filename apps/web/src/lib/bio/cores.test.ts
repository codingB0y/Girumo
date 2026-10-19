import assert from "node:assert/strict";
import { test } from "node:test";

import { contraste, garante } from "./cores";

const HEX = /^#[0-9A-F]{6}$/;

test("garante: devolve a própria cor quando já passa e empurra para o lado em que ela está", () => {
  assert.equal(garante("#16304F", "#FFFFFF", 4.5), "#16304F");
  assert.equal(garante("#16304f", "#FFFFFF", 4.5), "#16304F");
  const escurecida = garante("#999999", "#FFFFFF", 4.5);
  assert.ok(contraste(escurecida, "#FFFFFF") >= 4.5);
  assert.ok(contraste(escurecida, "#000000") < contraste("#999999", "#000000"), "texto cinza sobre branco escurece");
  const clareada = garante("#555555", "#222222", 4.5);
  assert.ok(contraste(clareada, "#222222") >= 4.5);
  assert.ok(contraste(clareada, "#FFFFFF") < contraste("#555555", "#FFFFFF"), "texto cinza sobre escuro clareia");
});

test("garante: fundo médio, onde a regra do mockup (lum > 0,4 ? preto : branco) devolvia branco com 3:1", () => {
  const cor = garante("#888888", "#959595", 4.5);
  assert.ok(contraste(cor, "#959595") >= 4.5, cor);
});

test("garante: se do próprio lado não dá, vai para o outro", () => {
  const cor = garante("#FFFFFF", "#F0F0F0", 4.5);
  assert.ok(contraste(cor, "#F0F0F0") >= 4.5, cor);
  assert.match(cor, HEX);
});
