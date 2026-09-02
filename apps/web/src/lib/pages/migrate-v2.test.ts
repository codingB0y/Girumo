import assert from "node:assert/strict";
import { test } from "node:test";
import type { LpContentV2 } from "./content";
import { validateContentV2 } from "./content";
import { toContentV3, validateContentV3 } from "./content-v3";
import { fromContentV2 } from "./migrate-v2";

/** Mesmo shape das 3 páginas v2 de prod (02/09/2026): vídeo, galeria de 3, com/sem benefícios e logo. */
function v2(overrides: Partial<LpContentV2> = {}): LpContentV2 {
  return {
    schema_version: 2,
    store_name: "Mega Stock",
    logo: { media_id: "m_logo", alt: "Mega Stock" },
    brand_color: "#E11D48",
    badge: "ATACADO DE MODA INFANTIL",
    headline: "FORNECEDOR DIRETO DE FÁBRICA",
    description: "Peças infantis com preço de atacado, reposição semanal e envio no mesmo dia.",
    cta: "Quero entrar no grupo",
    hero: { media_id: "m_hero", alt: "Arara de peças" },
    benefits: [
      { title: "Preço de fábrica", description: "sem intermediário" },
      { title: "Reposição semanal", description: "coleção sempre nova" },
      { title: "Pedido mínimo baixo", description: "6 peças, pode misturar" },
    ],
    gallery: [
      { media_id: "m_g1", alt: "Conjunto" },
      { media_id: "m_g2", alt: "Vestido" },
      { media_id: "m_g3", alt: "Body" },
    ],
    proof: {
      kind: "video",
      video: { provider: "vimeo", id: "1207228037", poster: { media_id: "m_poster", alt: "" } },
      name: "Mariana Alves",
      store: "Boutique MA",
      city: "Goiânia",
      quote: "As peças têm ótima saída e o atendimento é sempre rápido.",
    },
    ...overrides,
  };
}

test("a valid v2 page becomes a valid v3 page, and survives the sanitizer unchanged", () => {
  const source = v2();
  assert.deepEqual(validateContentV2(source), []);
  const out = fromContentV2(source);
  assert.deepEqual(validateContentV3(out), []);
  assert.equal(out.template, "acesso-vip");
  assert.equal(out.direction, "editorial");
  // o sanitizador não descarta nada do que o adaptador produziu
  assert.deepEqual(toContentV3(out as unknown as Record<string, unknown>), out);
});

test("keeps the v2 order: hero, proof, deliverables, gallery", () => {
  const out = fromContentV2(v2());
  assert.deepEqual(
    out.sections.slice(0, 4).map((s) => s.type),
    ["hero", "proof", "deliverables", "gallery"],
  );
});

test("video proof carries the embed and who is speaking", () => {
  const proof = fromContentV2(v2()).sections.find((s) => s.type === "proof");
  assert.ok(proof && proof.type === "proof");
  assert.equal(proof.variant, "video");
  assert.equal(proof.enabled, true);
  assert.deepEqual(proof.data.video, {
    provider: "vimeo",
    id: "1207228037",
    poster: { media_id: "m_poster", alt: "" },
    name: "Mariana Alves",
    detail: "Boutique MA · Goiânia",
    quote: "As peças têm ótima saída e o atendimento é sempre rápido.",
  });
});

test("hero keeps badge, headline, description and the v2 photo", () => {
  const hero = fromContentV2(v2()).sections[0];
  assert.ok(hero.type === "hero");
  assert.equal(hero.data.badge, "ATACADO DE MODA INFANTIL");
  assert.equal(hero.data.headline, "FORNECEDOR DIRETO DE FÁBRICA");
  assert.deepEqual(hero.data.media, { media_id: "m_hero", alt: "Arara de peças" });
});

test("no benefits → deliverables disabled but still valid (2 of the 3 prod pages)", () => {
  const out = fromContentV2(v2({ benefits: [], logo: null }));
  const d = out.sections.find((s) => s.type === "deliverables");
  assert.ok(d && d.type === "deliverables");
  assert.equal(d.enabled, false);
  assert.equal(out.logo, null);
  assert.deepEqual(validateContentV3(out), []);
});

test("photo proof becomes a single card; no proof stays disabled", () => {
  const photo = fromContentV2(
    v2({ proof: { kind: "photo", photo: { media_id: "m_p", alt: "Cliente" }, name: "Ana", store: "Loja A", city: "Recife", quote: "Voltei três vezes." } }),
  ).sections.find((s) => s.type === "proof");
  assert.ok(photo && photo.type === "proof");
  assert.equal(photo.variant, "cards");
  assert.deepEqual(photo.data.cards, [{ name: "Ana", detail: "Loja A · Recife", quote: "Voltei três vezes." }]);

  const none = fromContentV2(v2({ proof: null })).sections.find((s) => s.type === "proof");
  assert.ok(none && none.type === "proof");
  assert.equal(none.enabled, false);
  assert.deepEqual(validateContentV3(fromContentV2(v2({ proof: null }))), []);
});

test("every section title the v2 did not have is filled, none is empty", () => {
  const out = fromContentV2(v2());
  for (const s of out.sections) {
    if (!("title" in s.data)) continue;
    assert.ok(s.data.title.trim().length > 0, `${s.type} sem título`);
  }
});
