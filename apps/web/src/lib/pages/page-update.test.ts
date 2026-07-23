import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as pageSchema from "./schema";
import type { LandingPage } from "./schema";

type Patch = Partial<LandingPage>;
type Finalize = (
  existing: LandingPage,
  requested: Patch,
  nowIso?: string,
) =>
  | { ok: true; patch: Patch }
  | { ok: false; error: string };

const NOW = "2026-07-23T12:00:00.000Z";
const updateRouteSource = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "pages", "[id]", "route.ts"),
  "utf8",
);

function finalize(): Finalize {
  const candidate = (
    pageSchema as unknown as { finalizeLandingPageUpdate?: Finalize }
  ).finalizeLandingPageUpdate;
  assert.equal(typeof candidate, "function", "a regra final do PATCH precisa existir");
  return candidate as Finalize;
}

function page(overrides: Partial<LandingPage> = {}): LandingPage {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    template_id: "33333333-3333-4333-8333-333333333333",
    slug: "oferta-girumo",
    status: "draft",
    content: {
      store_name: "Girumo",
      photo_url: "https://cdn.example.com/hero.jpg",
      headline: "Oferta original",
      description: "Descrição original",
      group_topic: "ofertas",
      primary_color: "cobalt",
    },
    content_schema_version: 1,
    campaign_slug: null,
    target_group_url: "https://chat.whatsapp.com/grupo",
    meta_pixel_id: null,
    ga4_id: null,
    tiktok_pixel_id: null,
    structure: "conversion",
    visual_direction: "premium",
    model_version: 1,
    notice_version: "v1",
    published_version: 0,
    published_at: null,
    views_count: 0,
    leads_count: 0,
    created_at: "2026-07-20T10:00:00.000Z",
    updated_at: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

test("editar um draft não avança a versão publicada", () => {
  const existing = page();
  const result = finalize()(existing, {
    content: { ...existing.content, headline: "Oferta nova" },
  }, NOW);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.published_version, undefined);
});

test("a primeira publicação avança uma vez e registra published_at", () => {
  const result = finalize()(page(), { status: "published" }, NOW);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.published_version, 1);
  assert.equal(result.patch.published_at, NOW);
});

test("editar conteúdo já publicado avança exatamente uma versão", () => {
  const existing = page({
    status: "published",
    published_version: 4,
    published_at: "2026-07-22T10:00:00.000Z",
  });
  const result = finalize()(existing, {
    content: { ...existing.content, headline: "Oferta ao vivo atualizada" },
  }, NOW);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.published_version, 5);
});

test("patch sem mudança pública não avança a versão", () => {
  const existing = page({
    status: "published",
    published_version: 4,
    published_at: "2026-07-22T10:00:00.000Z",
  });
  const result = finalize()(existing, {
    status: "published",
    content: structuredClone(existing.content),
    ga4_id: existing.ga4_id,
  }, NOW);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.published_version, undefined);
});

test("publicar e editar no mesmo PATCH não incrementa em dobro", () => {
  const existing = page();
  const result = finalize()(existing, {
    status: "published",
    content: { ...existing.content, headline: "Conteúdo da estreia" },
  }, NOW);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.published_version, 1);
});

test("o destino é validado pelo estado final, inclusive sem campo status", () => {
  const publishedWithTwoDestinations = page({
    status: "published",
    published_version: 2,
    published_at: "2026-07-22T10:00:00.000Z",
    campaign_slug: "campanha",
  });
  const removesOne = finalize()(
    publishedWithTwoDestinations,
    { target_group_url: null },
    NOW,
  );
  assert.equal(removesOne.ok, true, "um destino pode ser apagado quando o outro permanece");

  const publishedWithOnlyTarget = page({
    status: "published",
    published_version: 2,
    published_at: "2026-07-22T10:00:00.000Z",
  });
  const removesBoth = finalize()(
    publishedWithOnlyTarget,
    { target_group_url: null, campaign_slug: null },
    NOW,
  );
  assert.deepEqual(removesBoth, {
    ok: false,
    error: "Defina o link do grupo ou uma campanha antes de publicar.",
  });

  const draftWithoutDestination = finalize()(
    page({ target_group_url: null }),
    { content: { ...page().content, headline: "Draft sem destino" } },
    NOW,
  );
  assert.equal(draftWithoutDestination.ok, true);
});

test("a rota aplica a regra final única antes de persistir", () => {
  assert.match(updateRouteSource, /finalizeLandingPageUpdate\(existing, patch\)/);
  assert.doesNotMatch(
    updateRouteSource,
    /if\s*\(status === "published"\)[\s\S]*published_version/,
  );
});
