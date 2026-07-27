import assert from "node:assert/strict";
import {
  EMPTY_EDITOR_VALUES_V2,
  contentV2ToEditorValues,
  editorValuesToContentV2,
  errorField,
  type EditorValuesV2,
} from "./editor-values";
import { validateContentV2 } from "./content";
import type { LpContentV2 } from "./content";

// ---- rascunho vazio: nunca explode, mas também não passa na validação ----
const draft = editorValuesToContentV2(EMPTY_EDITOR_VALUES_V2);
assert.equal(draft.schema_version, 2);
assert.ok(validateContentV2(draft).length > 0); // servidor é quem barra

// ---- preenchido: vira content v2 válido ----
function filled(): EditorValuesV2 {
  return {
    ...EMPTY_EDITOR_VALUES_V2,
    store_name: "Lume Atacado",
    brand_color: "#6d2436",
    badge: "Atacado de moda",
    headline: "Peças novas toda semana no grupo",
    description: "Entre no grupo e receba os drops com preço de atacado.",
    cta: "Entrar no grupo",
    hero: { media_id: "m_hero", alt: "Vitrine da loja" },
    benefits: [{ title: "Preço de atacado", description: "Direto da fábrica." }],
    gallery: [
      { media_id: "m1", alt: "Peça 1" },
      { media_id: "m2", alt: "Peça 2" },
    ],
    target_group_url: "https://chat.whatsapp.com/abc",
  };
}
const content = editorValuesToContentV2(filled());
assert.deepEqual(validateContentV2(content), []);
assert.equal(content.badge, "Atacado de moda");
assert.equal(content.proof, null); // prova desligada → ausente

// ---- prova: URL de vídeo do lojista vira {provider, id} (sem URL manual) ----
const withVideo = editorValuesToContentV2({
  ...filled(),
  proof: {
    enabled: true,
    kind: "video",
    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    poster: { media_id: "m_poster", alt: "Capa" },
    photo: null,
    name: "Ana",
    store: "Bazar da Ana",
    city: "Goiânia",
    quote: "Vendi tudo em uma semana.",
  },
});
assert.deepEqual(validateContentV2(withVideo), []);
assert.equal(withVideo.proof?.kind, "video");
if (withVideo.proof?.kind === "video") {
  assert.equal(withVideo.proof.video.provider, "youtube");
  assert.equal(withVideo.proof.video.id, "dQw4w9WgXcQ");
  assert.equal(withVideo.proof.video.poster?.media_id, "m_poster");
}

// URL de vídeo que não é YouTube/Vimeo → prova sai (servidor rejeitaria id vazio)
const badVideo = editorValuesToContentV2({
  ...filled(),
  proof: {
    enabled: true,
    kind: "video",
    video_url: "https://tiktok.com/@x/video/1",
    poster: null,
    photo: null,
    name: "Ana",
    store: "Bazar",
    city: "Goiânia",
    quote: "Boa.",
  },
});
assert.equal(badVideo.proof, null);
assert.deepEqual(validateContentV2(badVideo), []);

// prova ligada mas ainda sem foto → não vira prova quebrada
const emptyPhoto = editorValuesToContentV2({
  ...filled(),
  proof: {
    enabled: true,
    kind: "photo",
    video_url: "",
    poster: null,
    photo: null,
    name: "Ana",
    store: "Bazar",
    city: "Goiânia",
    quote: "Boa.",
  },
});
assert.equal(emptyPhoto.proof, null);

// ---- volta: página existente → valores do editor (ida e volta sem perda) ----
const roundTrip = contentV2ToEditorValues(withVideo as LpContentV2);
assert.equal(roundTrip.store_name, "Lume Atacado");
assert.equal(roundTrip.hero?.media_id, "m_hero");
assert.equal(roundTrip.gallery.length, 2);
assert.equal(roundTrip.proof.enabled, true);
assert.equal(roundTrip.proof.kind, "video");
// a URL volta reconstruída a partir de {provider, id} — o editor mostra algo colável
assert.ok(roundTrip.proof.video_url.includes("dQw4w9WgXcQ"));
assert.deepEqual(editorValuesToContentV2({ ...EMPTY_EDITOR_VALUES_V2, ...roundTrip }), withVideo);

// badge vazio não vira string vazia no content
assert.equal(contentV2ToEditorValues({ ...content, badge: undefined }).badge, "");

// ---- erros por campo: "headline excede 72 caracteres." → "headline" ----
assert.equal(errorField("headline excede 72 caracteres."), "headline");
assert.equal(errorField("hero precisa de media_id ou url."), "hero");
assert.equal(errorField("benefits[0].title é obrigatório."), "benefits[0].title");
assert.equal(errorField("content inválido."), "content");

console.log("editor-values tests passed");
