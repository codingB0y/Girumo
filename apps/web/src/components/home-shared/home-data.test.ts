import test from "node:test";
import assert from "node:assert/strict";

import { PLANS } from "@/components/lp3/landing-data";
import { MAX_OFF } from "@/components/lp-shared/lp-data";
import { HOME_FAQ, IMG, economiaAnual, plano, reais } from "./home-data";

test("a economia do anual sai de PLANS: (mensal - anual por mes) x 12", () => {
  // Os valores que a página mostra ("economiza R$ 840 por ano"). Se PLANS mudar de
  // preço, este teste quebra antes de o selo prometer uma economia que não existe.
  assert.equal(economiaAnual(plano("Essencial")), 840);
  assert.equal(economiaAnual(plano("Growth")), 1200);
  assert.equal(economiaAnual(plano("Operação")), 2400);
  for (const p of PLANS) assert.equal(economiaAnual(p), (p.price - p.annualPrice) * 12, p.name);
});

test("reais() escreve o milhar com ponto, sem centavos e sem deixar o R$ sozinho na linha", () => {
  assert.equal(reais(127), "R$ 127");
  assert.equal(reais(1200), "R$ 1.200");
  assert.equal(reais(2400), "R$ 2.400");
});

test("plano() acha pelo nome e falha alto quando o plano some", () => {
  assert.equal(plano("Growth").price, 297);
  assert.throws(() => plano("Ultra" as never), /Ultra/);
});

test("as perguntas das homes sao unicas, completas e sem vocabulario proibido", () => {
  assert.equal(HOME_FAQ.length, 8);
  assert.equal(new Set(HOME_FAQ.map(([pergunta]) => pergunta)).size, HOME_FAQ.length);
  for (const [pergunta, resposta] of HOME_FAQ) {
    assert.ok(pergunta.endsWith("?"), pergunta);
    assert.ok(resposta.length > 40, pergunta);
    assert.doesNotMatch(`${pergunta} ${resposta}`, /\bguru\b|escalar|\blead\b|piloto automático|disparo em massa|\bIA\b|medo de ban/i);
  }
});

test("a resposta do Pix cita o desconto do anual que sai de PLANS", () => {
  const pix = HOME_FAQ.find(([pergunta]) => pergunta === "Posso pagar no Pix?");
  assert.ok(pix, "pergunta do Pix sumiu");
  assert.ok(pix[1].includes(`até ${MAX_OFF}% mais barato`), pix[1]);
});

test("toda imagem das homes aponta pra public/home e tem tamanho declarado", () => {
  for (const [nome, img] of Object.entries(IMG)) {
    assert.match(img.src, /^\/home\/[a-z0-9-]+\.webp$/, nome);
    assert.ok(img.width > 0 && img.height > 0, nome);
  }
});
