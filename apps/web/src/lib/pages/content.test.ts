import assert from "node:assert/strict";
import {
  CONTENT_LIMITS,
  validateContentV2,
  adaptLegacyContent,
  toContentV2,
  type LpContentV2,
} from "./content";

// ---- limites exatos (contrato com o editor) ----
assert.equal(CONTENT_LIMITS.badge, 30);
assert.equal(CONTENT_LIMITS.headline, 72);
assert.equal(CONTENT_LIMITS.description, 180);
assert.equal(CONTENT_LIMITS.cta, 32);
assert.equal(CONTENT_LIMITS.benefit_title, 40);
assert.equal(CONTENT_LIMITS.benefit_desc, 90);

function validContent(): LpContentV2 {
  return {
    schema_version: 2,
    store_name: "Bazar da Vila",
    brand_color: "#7c3aed",
    badge: "Acesso VIP",
    headline: "Ofertas do grupo antes de todo mundo",
    description: "Entre no grupo e receba os drops com preço de atacado toda semana.",
    cta: "Entrar no grupo",
    hero: { media_id: "m_hero", alt: "Vitrine da loja" },
    benefits: [
      { title: "Preço de atacado", description: "Direto da fábrica, sem atravessador." },
      { title: "Novidades toda semana", description: "Coleções novas antes das lojas." },
    ],
    gallery: [
      { media_id: "m1", alt: "Peça 1" },
      { media_id: "m2", alt: "Peça 2" },
    ],
    proof: {
      kind: "video",
      video: { provider: "youtube", id: "dQw4w9WgXcQ" },
      name: "Ana",
      store: "Bazar da Ana",
      city: "Goiânia",
      quote: "Vendi tudo em uma semana usando o grupo.",
    },
  };
}

// conteúdo válido → nenhum erro
assert.deepEqual(validateContentV2(validContent()), []);

const base = validContent();
const hasError = (input: unknown, needle: string) =>
  validateContentV2(input).some((e) => e.includes(needle));

// limites de texto
assert.ok(hasError({ ...base, headline: "x".repeat(73) }, "headline"));
assert.ok(hasError({ ...base, description: "x".repeat(181) }, "description"));
assert.ok(hasError({ ...base, cta: "x".repeat(33) }, "cta"));
assert.ok(hasError({ ...base, badge: "x".repeat(31) }, "badge"));
assert.ok(hasError({ ...base, store_name: "" }, "store_name"));

// brand_color precisa ser hex
assert.ok(hasError({ ...base, brand_color: "roxo" }, "brand_color"));

// hero: media_id OU url, e alt obrigatório
assert.ok(hasError({ ...base, hero: { alt: "só alt" } }, "hero"));
assert.ok(hasError({ ...base, hero: { media_id: "m" } }, "hero"));

// galeria 2–6
assert.ok(hasError({ ...base, gallery: [{ media_id: "m1", alt: "a" }] }, "gallery"));
assert.ok(
  hasError(
    { ...base, gallery: Array.from({ length: 7 }, (_, i) => ({ media_id: `m${i}`, alt: `a${i}` })) },
    "gallery",
  ),
);

// benefícios: no máximo 3
assert.ok(
  hasError(
    { ...base, benefits: Array.from({ length: 4 }, (_, i) => ({ title: `t${i}`, description: `d${i}` })) },
    "benefits",
  ),
);
// benefício com título longo demais
assert.ok(
  hasError({ ...base, benefits: [{ title: "x".repeat(41), description: "ok" }] }, "benefits[0].title"),
);

// prova em vídeo com provider inválido
assert.ok(
  hasError(
    {
      ...base,
      proof: { kind: "video", video: { provider: "tiktok", id: "" }, name: "a", store: "b", city: "c", quote: "d" },
    },
    "proof",
  ),
);

// schema_version errado
assert.ok(hasError({ ...base, schema_version: 1 }, "schema_version"));

// ---- adaptador legado → v2 sem perda ----
const legacy = {
  store_name: "Mega Stock",
  photo_url: "https://cdn.example.com/loja.jpg",
  headline: "Atacado infantil com preço de fábrica",
  description: "Peças novas toda semana direto pro seu grupo VIP.",
  group_topic: "ofertas de atacado infantil",
  primary_color: "iris" as const,
};
const migrated = adaptLegacyContent(legacy);
assert.equal(migrated.schema_version, 2);
assert.equal(migrated.store_name, "Mega Stock");
assert.equal(migrated.headline, legacy.headline); // sem perda
assert.equal(migrated.description, legacy.description); // sem perda
assert.equal(migrated.hero.url, "https://cdn.example.com/loja.jpg"); // foto preservada como url
assert.ok(migrated.hero.alt.includes("Mega Stock"));
assert.equal(migrated.brand_color, "#7c3aed"); // iris → hex
assert.ok(migrated.cta.length > 0);

// ---- sanitizador: só o shape exato entra no JSONB ----
const dirty = {
  ...validContent(),
  store_name: "  Bazar da Vila  ", // trim
  badge: "",
  logo: null,
  evil: "<script>", // chave extra do client → descartada
  hero: { media_id: "m_hero", alt: "Vitrine", focal_x: 0.25, focal_y: 0.75, evil: 1 },
  benefits: [{ title: " Preço ", description: " Direto ", evil: 1 }],
  gallery: [
    { media_id: "m1", alt: "Peça 1", evil: 1 },
    { url: "https://cdn.example.com/2.jpg", alt: "Peça 2" },
  ],
};
const clean = toContentV2(dirty);
assert.equal(clean.schema_version, 2);
assert.equal(clean.store_name, "Bazar da Vila"); // trim aplicado
assert.equal("evil" in clean, false); // chave extra fora
assert.equal("evil" in clean.hero, false); // chave extra fora do media ref
assert.equal(clean.hero.focal_x, 0.25); // foco preservado
assert.equal(clean.badge, undefined); // badge vazio some (é opcional)
assert.equal(clean.logo, null);
assert.deepEqual(clean.benefits, [{ title: "Preço", description: "Direto" }]);
assert.equal(clean.gallery[1].url, "https://cdn.example.com/2.jpg"); // url externa preservada
assert.equal(clean.gallery[1].media_id, undefined);
// o resultado do sanitizador continua válido
assert.deepEqual(validateContentV2(clean), []);

// prova em vídeo sobrevive ao sanitizador; prova ausente vira null
assert.equal(clean.proof?.kind, "video");
assert.equal(toContentV2({ ...validContent(), proof: undefined }).proof, null);

console.log("content tests passed");
