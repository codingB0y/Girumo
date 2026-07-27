import assert from "node:assert/strict";
import test from "node:test";
import * as pageSchema from "./schema";

type PublicSerializer = (page: Record<string, unknown>) => Record<string, unknown>;

test("serializa somente os campos necessários ao render público e omite destinos", () => {
  const serialize = (
    pageSchema as unknown as { toPublicPagePayload?: PublicSerializer }
  ).toPublicPagePayload;

  assert.equal(typeof serialize, "function", "o serializer público precisa existir");
  if (!serialize) return;

  const payload = serialize({
    id: "lp-internal-id",
    tenant_id: "tenant-secret",
    template_id: "template-internal-id",
    slug: "oferta-girumo",
    status: "published",
    content: { schema_version: 2, store_name: "Girumo" },
    content_schema_version: 2,
    campaign_slug: "campanha-secreta",
    target_group_url: "https://chat.whatsapp.com/destino-secreto",
    meta_pixel_id: "123456",
    ga4_id: "G-ABC",
    tiktok_pixel_id: "TT-SECRET",
    structure: "conversion",
    visual_direction: "premium",
    model_version: 7,
    notice_version: "v3",
    published_version: 9,
    published_at: "2026-07-23T10:00:00.000Z",
    views_count: 42,
    leads_count: 12,
    created_at: "2026-07-20T10:00:00.000Z",
    updated_at: "2026-07-23T10:00:00.000Z",
    component_key: "girumo-v2",
    template_copy: { cta: "Quero entrar" },
    operational_secret: "nunca serializar",
  });

  assert.deepEqual(payload, {
    slug: "oferta-girumo",
    content: { schema_version: 2, store_name: "Girumo" },
    component_key: "girumo-v2",
    template_copy: { cta: "Quero entrar" },
    meta_pixel_id: "123456",
    ga4_id: "G-ABC",
  });
  assert.doesNotMatch(JSON.stringify(payload), /campanha-secreta|destino-secreto/);
});
