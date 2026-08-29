import assert from "node:assert/strict";
import test from "node:test";
import { BRAND, BRAND_COLORS, getBrandAssetUrl, getPublicSiteUrl } from "./brand";

test("exposes the approved Girumo identity", () => {
  assert.equal(BRAND.name, "Girumo");
  assert.equal(BRAND.pronunciation, "Gi-ru-mo, com tonicidade em ru");
  assert.equal(BRAND.tagline, "Mais grupos lotados. Menos trabalho. Mais vendas.");
  assert.equal(BRAND.functionalLine, "Seus grupos rodando. Você vendendo.");
  assert.deepEqual(BRAND.products, ["Girumo Pages", "Girumo Grupos", "Girumo Campanhas", "Girumo Agenda", "Girumo Resultados"]);
  assert.equal(BRAND.symbolPaperAsset, "/brand/girumo/svg/girumo-symbol-paper.svg");
  assert.equal(BRAND.symbolCanvasAsset, "/brand/girumo/svg/girumo-symbol-canvas.svg");
  assert.equal(BRAND_COLORS.volt, "#071923");
  assert.equal(BRAND_COLORS.volt900, "#0C2835");
  assert.equal(BRAND_COLORS.volt800, "#123746");
  assert.equal(BRAND_COLORS.acid, "#A7FF2F");
  assert.equal(BRAND_COLORS.cobalt, "#2E66FF");
  assert.equal(BRAND_COLORS.info, "#1947C9");
  assert.equal(BRAND_COLORS.info700, "#1947C9");
  assert.equal(BRAND_COLORS.canvas, "#F4F0E7");
  assert.equal(BRAND_COLORS.paper, "#FFFEFA");
});

test("defaults to the Girumo public host and honours the env override", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(getPublicSiteUrl(), "https://www.girumo.com.br");
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/";
    assert.equal(getPublicSiteUrl(), "https://example.test");
    assert.equal(
      getBrandAssetUrl(BRAND.symbolPaperAsset),
      "https://example.test/brand/girumo/svg/girumo-symbol-paper.svg",
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("strips stray whitespace around the env host", () => {
  // Em 28/ago/2026 a NEXT_PUBLIC_SITE_URL de produção estava com um TAB no
  // início — colada errada no painel da Vercel. O sitemap saiu com
  // "<loc>\thttps://..." e a diretiva Sitemap: do robots.txt idem. <loc> com
  // whitespace inicial é URL inválida pelo spec de sitemap, então o arquivo
  // inteiro corre risco de ser rejeitado pelo parser do buscador.
  // O trim tem que vir ANTES do corte da barra final, senão " .../ " sobra com a barra.
  const previous = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    process.env.NEXT_PUBLIC_SITE_URL = "\thttps://www.girumo.com.br/ ";
    assert.equal(getPublicSiteUrl(), "https://www.girumo.com.br");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
