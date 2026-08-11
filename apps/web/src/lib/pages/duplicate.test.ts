import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDuplicatePayload } from "./duplicate";
import type { LandingPage } from "./schema";

const ORIGINAL: LandingPage = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  template_id: "33333333-3333-4333-8333-333333333333",
  slug: "bazar-de-inverno",
  status: "published",
  content: {
    store_name: "Mega Stock",
    photo_url: "https://cdn.exemplo.com/foto.jpg",
    headline: "Bazar de inverno",
    description: "Peças a partir de R$ 12",
    group_topic: "atacado infantil",
    primary_color: "cobalt",
  },
  content_schema_version: 1,
  campaign_slug: "bazar-julho",
  target_group_url: "https://chat.whatsapp.com/ABC123",
  meta_pixel_id: "1234567890",
  ga4_id: "G-ABC123",
  tiktok_pixel_id: "TT-999",
  structure: "conversion",
  visual_direction: "premium",
  model_version: 1,
  notice_version: "v1",
  published_version: 3,
  published_at: "2026-08-01T12:00:00.000Z",
  views_count: 420,
  leads_count: 37,
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

test("a cópia leva o conteúdo, o template, o grupo e os pixels", () => {
  const payload = buildDuplicatePayload(ORIGINAL);

  assert.equal(payload.template_id, ORIGINAL.template_id);
  assert.deepEqual(payload.content, ORIGINAL.content);
  assert.equal(payload.target_group_url, "https://chat.whatsapp.com/ABC123");
  assert.equal(payload.meta_pixel_id, "1234567890");
  assert.equal(payload.ga4_id, "G-ABC123");
});

test("a cópia NÃO leva campaign_slug — senão as duas páginas somam na mesma atribuição", () => {
  const payload = buildDuplicatePayload(ORIGINAL);

  assert.ok(!("campaign_slug" in payload), "campaign_slug não pode ir no payload da cópia");
});

test("a cópia NÃO leva identidade, métricas nem estado de publicação", () => {
  const payload = buildDuplicatePayload(ORIGINAL);

  for (const proibido of [
    "id",
    "slug",
    "status",
    "published_version",
    "published_at",
    "views_count",
    "leads_count",
    "created_at",
    "updated_at",
  ]) {
    assert.ok(!(proibido in payload), `${proibido} não pode ir no payload da cópia`);
  }
});

test("campos opcionais ausentes viram null, não undefined", () => {
  const payload = buildDuplicatePayload({
    ...ORIGINAL,
    target_group_url: null,
    meta_pixel_id: null,
    ga4_id: null,
  });

  assert.equal(payload.target_group_url, null);
  assert.equal(payload.meta_pixel_id, null);
  assert.equal(payload.ga4_id, null);
});

test("o conteúdo é repassado por referência de valor, sem perder campos do v2", () => {
  const v2 = {
    ...ORIGINAL,
    content_schema_version: 2 as const,
    content: {
      store_name: "Mega Stock",
      headline: "Bazar de inverno",
      description: "Peças a partir de R$ 12",
      brand_color: "#7c3aed",
      cta_label: "Quero entrar no grupo",
      benefits: ["Frete grátis", "Peças novas"],
    } as unknown as LandingPage["content"],
  };

  assert.deepEqual(buildDuplicatePayload(v2).content, v2.content);
});
