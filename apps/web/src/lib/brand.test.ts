import assert from "node:assert/strict";
import test from "node:test";
import { BRAND, BRAND_COLORS, getBrandAssetUrl, getPublicSiteUrl } from "./brand";

test("exposes the approved Girumo identity", () => {
  assert.equal(BRAND.name, "Girumo");
  assert.equal(BRAND.pronunciation, "Gi-ru-mo, com tonicidade em ru");
  assert.equal(BRAND.tagline, "Mais grupos lotados. Menos trabalho. Mais vendas.");
  assert.equal(BRAND.functionalLine, "Seus grupos rodando. Você vendendo.");
  assert.deepEqual(BRAND.products, ["Girumo Pages", "Girumo Grupos", "Girumo Campanhas", "Girumo Agenda", "Girumo Resultados"]);
  assert.equal(BRAND_COLORS.volt, "#071923");
  assert.equal(BRAND_COLORS.volt900, "#0C2835");
  assert.equal(BRAND_COLORS.volt800, "#123746");
  assert.equal(BRAND_COLORS.acid, "#A7FF2F");
  assert.equal(BRAND_COLORS.cobalt, "#2E66FF");
  assert.equal(BRAND_COLORS.info, "#1947C9");
  assert.equal(BRAND_COLORS.info700, "#1947C9");
  assert.equal(BRAND_COLORS.canvas, "#F4F0E7");
});

test("uses the current host until a new public host is configured", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(getPublicSiteUrl(), "https://hubflow.com.br");
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/";
    assert.equal(getPublicSiteUrl(), "https://example.test");
    assert.equal(
      getBrandAssetUrl("/brand/girumo/svg/girumo-symbol-canvas.svg"),
      "https://example.test/brand/girumo/svg/girumo-symbol-canvas.svg",
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
