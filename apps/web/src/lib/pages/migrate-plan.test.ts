import assert from "node:assert/strict";
import { test } from "node:test";
import type { LpContentV2 } from "./content";
import { validateContentV3 } from "./content-v3";
import { planMigrationToV3 } from "./schema";

function v2(overrides: Partial<LpContentV2> = {}): LpContentV2 {
  return {
    schema_version: 2,
    store_name: "Mega Stock",
    logo: null,
    brand_color: "#E11D48",
    badge: "ATACADO DE MODA INFANTIL",
    headline: "FORNECEDOR DIRETO DE FÁBRICA",
    description: "Peças infantis com preço de atacado, reposição semanal e envio no mesmo dia.",
    cta: "Quero entrar no grupo",
    hero: { media_id: "m_hero", alt: "Arara de peças" },
    benefits: [{ title: "Preço de fábrica", description: "sem intermediário" }],
    gallery: [
      { media_id: "m_g1", alt: "Conjunto" },
      { media_id: "m_g2", alt: "Vestido" },
    ],
    proof: null,
    ...overrides,
  };
}

test("a v2 page yields a valid acesso-vip/editorial patch and keeps the original as content_before_v3", () => {
  const content = v2();
  const plan = planMigrationToV3({ content, content_before_v3: null });
  assert.ok(plan.ok);
  assert.deepEqual(validateContentV3(plan.patch.content), []);
  assert.equal(plan.patch.content.schema_version, 3);
  assert.equal(plan.patch.structure, "acesso-vip");
  assert.equal(plan.patch.visual_direction, "editorial");
  assert.equal(plan.patch.model_version, 1);
  assert.deepEqual(plan.patch.content_before_v3, content);
  // só dimensões + content: status, slug, campanha e pixels ficam de fora
  assert.deepEqual(
    Object.keys(plan.patch).sort(),
    ["content", "content_before_v3", "model_version", "structure", "visual_direction"],
  );
});

test("a second migration (after a manual revert) never overwrites the first v2 copy", () => {
  const first = v2();
  const reverted = v2({ headline: "EDITADA DEPOIS DE REVERTER" });
  const plan = planMigrationToV3({ content: reverted, content_before_v3: first });
  assert.ok(plan.ok);
  assert.equal("content_before_v3" in plan.patch, false);
  assert.equal(plan.patch.content.schema_version, 3);
});

test("refuses content that is not v2 (legacy and already-migrated v3 alike)", () => {
  const legacy = planMigrationToV3({
    content: {
      store_name: "x",
      photo_url: "https://a/b.jpg",
      headline: "h",
      description: "d",
      group_topic: "t",
      primary_color: "cobalt",
    },
  });
  assert.deepEqual(legacy, { ok: false, reason: "not_v2" });

  const migrated = planMigrationToV3({ content: v2() });
  assert.ok(migrated.ok);
  const again = planMigrationToV3({ content: migrated.patch.content, content_before_v3: v2() });
  assert.deepEqual(again, { ok: false, reason: "not_v2" });
});
