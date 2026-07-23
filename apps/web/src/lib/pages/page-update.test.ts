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
const storeSource = readFileSync(
  path.join(process.cwd(), "src", "lib", "pages", "store.ts"),
  "utf8",
);

type CasResult =
  | { ok: true; page: LandingPage }
  | { ok: false; reason: "validation"; error: string }
  | { ok: false; reason: "not_found" | "conflict" };

type UpdateWithCas = (input: {
  initialPage: LandingPage;
  requestedPatch: Patch;
  compareAndSwap: (
    expected: LandingPage,
    patch: Patch,
  ) => Promise<LandingPage | null>;
  reload: () => Promise<LandingPage | null>;
  nowIso?: string;
}) => Promise<CasResult>;

function finalize(): Finalize {
  const candidate = (
    pageSchema as unknown as { finalizeLandingPageUpdate?: Finalize }
  ).finalizeLandingPageUpdate;
  assert.equal(typeof candidate, "function", "a regra final do PATCH precisa existir");
  return candidate as Finalize;
}

async function updateWithCas(): Promise<UpdateWithCas> {
  const loadedModule = await import("./page-update").catch(() => ({}));
  const candidate = (
    loadedModule as unknown as { updateLandingPageWithCas?: UpdateWithCas }
  ).updateLandingPageWithCas;
  assert.equal(
    typeof candidate,
    "function",
    "o PATCH precisa de um coordenador CAS com retry",
  );
  return candidate as UpdateWithCas;
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

test("PATCHes públicos concorrentes incrementam uma vez cada sem lost update", async () => {
  const update = await updateWithCas();
  let persisted = page({
    status: "published",
    published_version: 4,
    published_at: "2026-07-22T10:00:00.000Z",
  });
  let revision = 0;

  const reload = async () => structuredClone(persisted);
  const compareAndSwap = async (expected: LandingPage, patch: Patch) => {
    const unchanged =
      persisted.published_version === expected.published_version &&
      persisted.status === expected.status;
    if (!unchanged) return null;

    revision += 1;
    persisted = {
      ...persisted,
      ...structuredClone(patch),
      updated_at: `2026-07-23T12:00:00.00${revision}Z`,
    };
    return structuredClone(persisted);
  };

  // Os dois requests fazem o SELECT antes de qualquer UPDATE.
  const firstSnapshot = await reload();
  const secondSnapshot = await reload();
  const [first, second] = await Promise.all([
    update({
      initialPage: firstSnapshot,
      requestedPatch: {
        content: { ...firstSnapshot.content, headline: "Oferta concorrente A" },
      },
      compareAndSwap,
      reload,
      nowIso: NOW,
    }),
    update({
      initialPage: secondSnapshot,
      requestedPatch: {
        content: { ...secondSnapshot.content, headline: "Oferta concorrente B" },
      },
      compareAndSwap,
      reload,
      nowIso: NOW,
    }),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(
    [first.page.published_version, second.page.published_version].sort(),
    [5, 6],
  );
  assert.equal(persisted.published_version, 6);
});

test("CAS encerra em conflito depois do limite de tentativas", async () => {
  const update = await updateWithCas();
  const initialPage = page({
    status: "published",
    published_version: 7,
    published_at: "2026-07-22T10:00:00.000Z",
  });
  let attempts = 0;
  let reloads = 0;

  const result = await update({
    initialPage,
    requestedPatch: {
      content: { ...initialPage.content, headline: "Oferta disputada" },
    },
    compareAndSwap: async () => {
      attempts += 1;
      return null;
    },
    reload: async () => {
      reloads += 1;
      return {
        ...initialPage,
        published_version: initialPage.published_version + reloads,
      };
    },
    nowIso: NOW,
  });

  assert.deepEqual(result, { ok: false, reason: "conflict" });
  assert.equal(attempts, 3);
  assert.equal(reloads, 2);
});

test("a rota usa o coordenador e o store faz UPDATE condicional atômico", () => {
  assert.match(updateRouteSource, /updateLandingPageWithCas\(\{/);
  assert.match(updateRouteSource, /compareAndSwapLandingPage/);
  assert.doesNotMatch(updateRouteSource, /await updateLandingPage\(/);
  assert.match(
    storeSource,
    /\.eq\("published_version",\s*expected\.published_version\)/,
  );
  assert.match(
    storeSource,
    /\.eq\("status",\s*expected\.status\)/,
  );
  assert.doesNotMatch(
    updateRouteSource,
    /if\s*\(status === "published"\)[\s\S]*published_version/,
  );
});
