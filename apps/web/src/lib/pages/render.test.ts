import assert from "node:assert/strict";
import { isLpContentV2, resolveStructureKind } from "./render";

const v2 = {
  schema_version: 2,
  store_name: "Loja X",
  brand_color: "#7c3aed",
  headline: "Título",
  description: "Descrição",
  cta: "Entrar",
  hero: { url: "https://x/y.jpg", alt: "hero" },
  benefits: [],
  gallery: [
    { url: "https://x/1.jpg", alt: "1" },
    { url: "https://x/2.jpg", alt: "2" },
  ],
};

const legacy = {
  store_name: "Loja X",
  photo_url: "https://x/y.jpg",
  headline: "Título",
  description: "Descrição",
  group_topic: "ofertas",
  primary_color: "iris",
};

// isLpContentV2 — só reconhece schema_version === 2 (estrito).
assert.equal(isLpContentV2(v2), true);
assert.equal(isLpContentV2(legacy), false);
assert.equal(isLpContentV2({ schema_version: 1 }), false);
assert.equal(isLpContentV2({ schema_version: "2" }), false); // string não conta
assert.equal(isLpContentV2(null), false);
assert.equal(isLpContentV2(undefined), false);
assert.equal(isLpContentV2("nope"), false);

// resolveStructureKind — v2 → editorial; qualquer outro (legado) → basic (fallback).
assert.equal(resolveStructureKind(v2), "editorial");
assert.equal(resolveStructureKind(legacy), "basic");
assert.equal(resolveStructureKind(null), "basic");

console.log("render tests passed");
