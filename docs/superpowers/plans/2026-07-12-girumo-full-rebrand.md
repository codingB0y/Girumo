# Girumo Full Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public HubFlow identity with the approved Girumo/Deslocamento system, deliver exportable brand assets, and migrate every public and authenticated surface without renaming compatibility-sensitive infrastructure.

**Architecture:** Establish one typed brand contract and one geometry source, generate deterministic SVG/PNG/ICO assets from them, and make React, metadata, email, social, and documentation consumers depend on those sources. Apply Volt Commerce through global tokens and shared primitives first; then migrate shells and public surfaces in isolated reviewable tasks. Preserve `hubflow-web`, `hubflow-engine`, database identifiers, legacy URLs, and old-host allowlists as internal compatibility boundaries.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, `next/font`, Node test runner via `tsx`, Sharp 0.34.5, Fontkit 2.0.4, `png-to-ico` 3.0.2, `@fontsource/manrope` 5.2.8.

## Global Constraints

- Public brand name is exactly `Girumo`; use title case in copy and interfaces.
- Approved tagline is exactly `Mais grupos lotados. Menos trabalho. Mais vendas.`
- Approved functional line is exactly `Seus grupos rodando. Você vendendo.`
- Approved symbol is Deslocamento with viewBox `0 0 24 24` and exactly two monochrome masses.
- Primary palette: Volt `#071923`, Acid `#A7FF2F`, Cobalt `#2E66FF`, Canvas `#F4F0E7`.
- Normal text on canvas must use `#071923`, `#52646C`, or accessible Cobalt `#1947C9`; raw `#2E66FF` is not normal body text.
- Acid is a brand/action color, not a success state; success text is `#0C7346`.
- Brand typography is Manrope; product typography is IBM Plex Sans; data typography is IBM Plex Mono.
- The primary logo is monochromatic; never color the two symbol masses differently.
- Do not introduce WhatsApp bubbles, arrows, orbits, node networks, lightning bolts, gradients, glassmorphism, or decorative auroras.
- Keep legacy domains working until a Girumo domain is acquired and legally cleared.
- Do not rename packages, workspaces, Docker images, environment variable prefixes, database objects, `service: "hubflow-web"`, or historical documents.
- Reserve both `hubflow` and `girumo` as public page slugs.
- Public copy uses `publique` or `envie`; avoid `disparo em massa`, `IA`, `guru`, and unsupported claims.
- The worktree can contain unrelated user changes. Record `git status --short` before each task, inspect overlapping files, stage only exact task-owned paths, and never use a broad directory to absorb pre-existing edits.
- Design-sync build artifacts remain ephemeral by repository convention: validate `apps/web/.ds-entry.tsx`, `apps/web/.ds-styles.css`, and `ds-bundle/**` locally, but do not force-add them through `.gitignore`.

---

## File Structure and Boundaries

### New sources of truth

- `apps/web/src/lib/brand.ts` — public name, copy, palette, transitional URL helpers.
- `apps/web/src/lib/girumo-symbol.ts` — approved path geometry and SVG renderer.
- `apps/web/src/components/brand/logo.tsx` — accessible React symbol and lockup.
- `apps/web/scripts/export-girumo-brand.ts` — deterministic SVG, PNG, ICO, avatar, and OG exporter.
- `apps/web/scripts/check-girumo-brand.mjs` — public-surface residual-name and legacy-color gate.
- `apps/web/src/app/manifest.ts` — install metadata and generated icon references.
- `apps/web/public/brand/girumo/` — generated brand asset output.
- `docs/brand/girumo/` — current operational brand guide and marketing source files.

### Existing files changed together

- Foundation: `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/components/ui/{button,input,card,badge,skeleton}.tsx`.
- Persistent shells: `apps/web/src/components/auth-shell.tsx`, `apps/web/src/components/painel/{sidebar,topbar,mobile-nav}.tsx`, `apps/web/src/components/admin/sidebar.tsx`.
- Main marketing: `apps/web/src/app/page.tsx`, `apps/web/src/components/landing/v2/{nav,compare,faq,features,mechanism,lp-showcase}.tsx`.
- Experimental marketing: `apps/web/src/app/lp/page.tsx`, `apps/web/src/app/lp2/page.tsx`, `apps/web/src/components/lp/{nav,calculator}.tsx`, `apps/web/src/components/lp2/{nav,panel-mock}.tsx`.
- Discovery: `apps/web/src/app/{robots,sitemap}.ts`, root/page metadata, `apps/web/src/app/p/[slug]/page.tsx`.
- Transactional: `apps/web/src/lib/email/{templates,client}.ts`, `apps/web/src/lib/stores/automations.ts`, signup and email cron routes.
- Social: `apps/web/src/app/posts/{layout,page}.tsx`, `apps/web/src/app/posts/og/route.tsx`, `apps/web/src/components/posts/post-gallery.tsx`.
- Validation: `infra/scripts/verify-online.ps1`, environment templates, and new brand tests.

---

### Task 1: Create the Typed Brand Contract

**Files:**
- Create: `apps/web/src/lib/brand.ts`
- Create: `apps/web/src/lib/brand.test.ts`

**Interfaces:**
- Produces: `BRAND`, `BRAND_PRODUCTS`, `BRAND_COLORS`, `getPublicSiteUrl()`, `getBrandAssetUrl(path, siteUrl?)`.
- Consumers: metadata, landing, email, social generator, manifest, robots, sitemap.

- [ ] **Step 1: Write the failing contract test**

```ts
// apps/web/src/lib/brand.test.ts
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
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/brand.test.ts`

Expected: FAIL because `./brand` does not exist.

- [ ] **Step 3: Implement the brand contract**

```ts
// apps/web/src/lib/brand.ts
export const BRAND = {
  name: "Girumo",
  pronunciation: "Gi-ru-mo, com tonicidade em ru",
  tagline: "Mais grupos lotados. Menos trabalho. Mais vendas.",
  functionalLine: "Seus grupos rodando. Você vendendo.",
  description:
    "Capte clientes, organize seus grupos de WhatsApp e deixe campanhas programadas para vender com menos trabalho.",
  emailFooter: "Girumo · Automação para grupos que vendem",
  symbolAsset: "/brand/girumo/svg/girumo-symbol-volt.svg",
  symbolCanvasAsset: "/brand/girumo/svg/girumo-symbol-canvas.svg",
  ogAsset: "/brand/girumo/social/og-default-1200x630.png",
  emailLogoAsset: "/brand/girumo/email/girumo-email-lockup-640x160.png",
  products: ["Girumo Pages", "Girumo Grupos", "Girumo Campanhas", "Girumo Agenda", "Girumo Resultados"],
} as const;

export const BRAND_PRODUCTS = BRAND.products;

export const BRAND_COLORS = {
  volt: "#071923",
  volt950: "#071923",
  volt900: "#0C2835",
  volt800: "#123746",
  acid: "#A7FF2F",
  cobalt: "#2E66FF",
  cobalt500: "#2E66FF",
  cobalt700: "#1947C9",
  cobaltText: "#1947C9",
  info: "#1947C9",
  info700: "#1947C9",
  canvas: "#F4F0E7",
  paper: "#FFFEFA",
  slate: "#52646C",
  line: "#D8D7CF",
  success: "#0C7346",
  warning: "#7A4A00",
  danger: "#B82936",
} as const;

export function getPublicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://hubflow.com.br").replace(/\/$/, "");
}

export function getBrandAssetUrl(pathname: string, siteUrl = getPublicSiteUrl()): string {
  return new URL(pathname, `${siteUrl.replace(/\/$/, "")}/`).toString();
}
```

- [ ] **Step 4: Run the test and full web test suite**

Run: `npm --workspace apps/web test`

Expected: all tests PASS.

- [ ] **Step 5: Commit the contract**

```powershell
git add apps/web/src/lib/brand.ts apps/web/src/lib/brand.test.ts
git commit -m "feat: add Girumo brand contract"
```

---

### Task 2: Build the Deterministic Brand Asset Pipeline

**Files:**
- Create: `apps/web/src/lib/girumo-symbol.ts`
- Generate: `apps/web/src/lib/girumo-wordmark.ts`
- Create: `apps/web/src/lib/brand-assets.test.ts`
- Create: `apps/web/scripts/export-girumo-brand.ts`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Generate: `apps/web/public/brand/girumo/**`

**Interfaces:**
- Produces: `GIRUMO_VIEWBOX`, `GIRUMO_PATHS`, `renderGirumoSymbolSvg()`, generated `GIRUMO_WORDMARK_VIEWBOX`, `GIRUMO_WORDMARK_PATHS`, `GIRUMO_WORDMARK_ASPECT_RATIO`, and `npm run brand:export`.
- Consumers: React logo component, app icon, manifest, email, posts, documentation.

- [ ] **Step 1: Install the export-only dependencies**

Run:

```powershell
npm install --save-dev --workspace apps/web sharp@0.34.5 fontkit@2.0.4 @types/fontkit@2.0.9 png-to-ico@3.0.2 @fontsource/manrope@5.2.8
```

Expected: `apps/web/package.json` and root `package-lock.json` change; no runtime dependency is added.

- [ ] **Step 2: Add the approved symbol source**

```ts
// apps/web/src/lib/girumo-symbol.ts
export const GIRUMO_VIEWBOX = "0 0 24 24";
export const GIRUMO_PATHS = [
  "M5 2H12V10H9V22H5A3 3 0 0 1 2 19V5A3 3 0 0 1 5 2Z",
  "M14 2H19A3 3 0 0 1 22 5V19A3 3 0 0 1 19 22H11V14H14V2Z",
] as const;

export function renderGirumoSymbolSvg(color = "#071923", size = 24): string {
  const paths = GIRUMO_PATHS.map((d) => `<path fill="${color}" d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GIRUMO_VIEWBOX}" width="${size}" height="${size}" aria-hidden="true">${paths}</svg>`;
}
```

- [ ] **Step 3: Write the failing asset test**

```ts
// apps/web/src/lib/brand-assets.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(process.cwd(), "public", "brand", "girumo");
const expected = [
  "svg/girumo-symbol-volt.svg",
  "svg/girumo-symbol-canvas.svg",
  "svg/girumo-symbol-black.svg",
  "svg/girumo-lockup-horizontal-volt.svg",
  "svg/girumo-lockup-horizontal-canvas.svg",
  "svg/girumo-lockup-stacked-volt.svg",
  "svg/girumo-wordmark-volt.svg",
  "png/symbol-16.png",
  "png/symbol-32.png",
  "png/symbol-48.png",
  "png/symbol-180.png",
  "png/symbol-192.png",
  "png/symbol-512.png",
  "png/symbol-1024.png",
  "social/instagram-avatar-1080.png",
  "social/instagram-avatar-dark-1080.png",
  "social/og-default-1200x630.png",
  "email/girumo-email-lockup-640x160.png",
  "favicon.ico",
];

test("exports the complete Girumo asset set", () => {
  for (const relative of expected) assert.ok(existsSync(path.join(root, relative)), relative);
});

test("exports outlined wordmarks instead of SVG text", () => {
  const wordmark = readFileSync(path.join(root, "svg/girumo-wordmark-volt.svg"), "utf8");
  assert.doesNotMatch(wordmark, /<text\b|<image\b/i);
  assert.equal((wordmark.match(/<path\b/g) || []).length, 6);
});
```

Also add asynchronous asset-integrity tests that:

- rasterize every SVG with Sharp, rejecting malformed XML, embedded images, clipping, or zero-sized output;
- assert the seven PNG dimensions, alpha behavior, and `srgb` color space;
- assert both avatars, the OG image, and the 640×160 e-mail lockup report `srgb`, and measure both avatar symbol bounding boxes as `61% ± 0.5%` of the 1080 px canvas;
- parse the ICO directory header and assert exactly 16, 32, and 48 px entries;
- compare the 16 px alpha channel to confirm the stepped passage stays at least one transparent device pixel wide;
- confirm the alternate avatar is Canvas on Volt and the black SVG contains only `#000000`.

- [ ] **Step 4: Run the test and verify the missing-assets failure**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/brand-assets.test.ts`

Expected: FAIL and list the first absent asset.

- [ ] **Step 5: Implement the exporter**

The exporter must:

1. load the static Manrope 700 Latin WOFF2 through Fontkit and assert its Bold/700 metadata before outlining; this avoids Fontkit 2.0.4's reproducible `getVariation()` corruption on variable WOFF2 while preserving the exact approved weight;
2. convert each `Girumo` glyph to a real `<path d="…">` element with `-3%` global tracking and the approved pair adjustments;
3. flip font coordinates onto the SVG baseline, derive the viewBox from the union of transformed glyph bounding boxes, and add 2% safety padding;
4. compose symbol, horizontal lockup, stacked lockup, and wordmark SVGs using the approved optical proportions;
5. write the same six `{ d, transform }` outlined glyph records, normalized viewBox, and aspect ratio into deterministic `apps/web/src/lib/girumo-wordmark.ts` exports so React preserves baseline flips and pair positions without recreating the wordmark with browser text kerning;
6. rasterize symbol sizes with Sharp; reuse the master geometry at 16 px only if the transparent passage remains at least one pixel wide across every relevant raster row, otherwise export an explicit `GIRUMO_MICRO_PATHS` correction that moves only the internal passage edges by at most `0.25` viewBox unit while preserving all external masses and every other proportion;
7. create the navy-on-Acid and Canvas-on-Volt Instagram avatars with the symbol fixed at exactly `61%` of the 1080 px canvas before antialiasing;
8. create the default 1200×630 Volt OG image with Canvas lockup and approved tagline;
9. rasterize a dedicated opaque 640×160 Volt e-mail header with the Canvas horizontal lockup so transactional templates never depend on external SVG support;
10. combine the already-exported 16, 32, and 48 px PNG file paths with `png-to-ico`;
11. delete or overwrite only the known generated files on rerun, preserving `girumo-brand-guide.pdf` and any documented manual deliverables in the output root.

Add this package script:

```json
"brand:export": "tsx scripts/export-girumo-brand.ts"
```

Use these fixed output and color declarations in the exporter:

```ts
import { createRequire } from "node:module";
import * as fontkit from "fontkit";

const require = createRequire(import.meta.url);
const MANROPE_PATH = require.resolve("@fontsource/manrope/files/manrope-latin-700-normal.woff2");
const OUTPUT = path.join(process.cwd(), "public", "brand", "girumo");
const COLORS = { volt: "#071923", acid: "#A7FF2F", canvas: "#F4F0E7", black: "#000000" } as const;
const PNG_SIZES = [16, 32, 48, 180, 192, 512, 1024] as const;
const WORDMARK = "Girumo";
const AVATAR_SYMBOL_OCCUPANCY = 0.61;
const PAIR_ADJUST_EM = { Gi: -0.012, ir: 0.016, um: -0.01, mo: -0.01 } as const;
const LOCKUP = { symbolToCapHeight: 1.06, gapToOWidth: 0.5, opticalYEm: -0.015 } as const;
```

The generated lockup SVG must use only path geometry:

```ts
type OutlineFont = {
  unitsPerEm: number;
  ascent: number;
  capHeight: number;
  layout(text: string): {
    glyphs: Array<{ path: { toSVG(): string; bbox: { minX: number; minY: number; maxX: number; maxY: number } } }>;
    positions: Array<{ xOffset: number; xAdvance: number }>;
  };
};

const opened = fontkit.openSync(MANROPE_PATH);
if ("fonts" in opened) throw new Error("Manrope export source must be one font, not a collection");
if (!/bold|700/i.test(`${opened.subfamilyName} ${opened.postscriptName}`)) {
  throw new Error("Manrope export source must be the static 700/Bold face");
}
const outlineFont = opened as unknown as OutlineFont;

function outlinedWordmarkSvg(font: OutlineFont, color: string) {
  const bold = font;
  const run = bold.layout(WORDMARK);
  const tracking = -0.03 * bold.unitsPerEm;
  let penX = 0;
  const paths = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const x = penX + position.xOffset;
    const path = `<path d="${glyph.path.toSVG()}" fill="${color}" transform="translate(${x} ${bold.ascent}) scale(1 -1)"/>`;
    const pair = WORDMARK.slice(index, index + 2) as keyof typeof PAIR_ADJUST_EM;
    const pairAdjustment = (PAIR_ADJUST_EM[pair] ?? 0) * bold.unitsPerEm;
    penX += position.xAdvance + (index < run.glyphs.length - 1 ? tracking + pairAdjustment : 0);
    return path;
  });
  return { paths: paths.join(""), advance: penX, unitsPerEm: bold.unitsPerEm };
}
```

Pass `outlineFont` into the generator and require exactly six glyphs so no ligature substitution can alter the wordmark. Do not use `advance` as the SVG width. Compute the final viewBox from the transformed path bounds so the last `o`, the baseline flip, and pair-specific spacing cannot clip. In the horizontal lockup, size the symbol to `1.06×` the Manrope cap height, set the gap to `0.5×` the measured `o` width, and apply the `-0.015em` optical vertical offset.

- [ ] **Step 6: Generate and validate assets**

Run:

```powershell
npm --workspace apps/web run brand:export
npm --workspace apps/web exec tsx -- --test src/lib/brand-assets.test.ts
```

Expected: exporter reports 19 public outputs plus the generated TypeScript wordmark geometry; asset tests PASS.

- [ ] **Step 7: Visually inspect the core assets**

Inspect:

- symbol at 16, 32, and 1024 px;
- symbol in Volt, Canvas, and production black;
- horizontal lockup on canvas and navy;
- both Instagram avatars in a circular crop;
- OG image at 1200×630.

Reject any output where the central passage closes, the wordmark clips, or the symbol is rendered in two colors.

- [ ] **Step 8: Commit the asset pipeline and outputs**

```powershell
git add apps/web/package.json package-lock.json apps/web/src/lib/girumo-symbol.ts apps/web/src/lib/girumo-wordmark.ts apps/web/src/lib/brand-assets.test.ts apps/web/scripts/export-girumo-brand.ts apps/web/public/brand/girumo/svg/girumo-symbol-volt.svg apps/web/public/brand/girumo/svg/girumo-symbol-canvas.svg apps/web/public/brand/girumo/svg/girumo-symbol-black.svg apps/web/public/brand/girumo/svg/girumo-lockup-horizontal-volt.svg apps/web/public/brand/girumo/svg/girumo-lockup-horizontal-canvas.svg apps/web/public/brand/girumo/svg/girumo-lockup-stacked-volt.svg apps/web/public/brand/girumo/svg/girumo-wordmark-volt.svg apps/web/public/brand/girumo/png/symbol-16.png apps/web/public/brand/girumo/png/symbol-32.png apps/web/public/brand/girumo/png/symbol-48.png apps/web/public/brand/girumo/png/symbol-180.png apps/web/public/brand/girumo/png/symbol-192.png apps/web/public/brand/girumo/png/symbol-512.png apps/web/public/brand/girumo/png/symbol-1024.png apps/web/public/brand/girumo/social/instagram-avatar-1080.png apps/web/public/brand/girumo/social/instagram-avatar-dark-1080.png apps/web/public/brand/girumo/social/og-default-1200x630.png apps/web/public/brand/girumo/email/girumo-email-lockup-640x160.png apps/web/public/brand/girumo/favicon.ico
git commit -m "feat: export Girumo brand assets"
```

---

### Task 3: Replace the Central Logo Component and App Icons

**Files:**
- Create: `apps/web/src/components/brand/logo.tsx`
- Create: `apps/web/src/components/brand/logo.test.ts`
- Delete: `apps/web/src/components/landing/logo.tsx`
- Modify importers: `apps/web/src/app/page.tsx`, `apps/web/src/components/auth-shell.tsx`, `apps/web/src/components/admin/sidebar.tsx`, `apps/web/src/components/painel/{sidebar,topbar,mobile-nav}.tsx`, `apps/web/src/components/landing/v2/nav.tsx`
- Replace: `apps/web/src/app/icon.svg`, `apps/web/src/app/favicon.ico`, `apps/web/src/app/apple-icon.png`
- Create: `apps/web/src/app/manifest.ts`

**Interfaces:**
- Produces: `LogoSymbol` and `Logo` with the same `className`, `symbolClassName`, and `wordmarkClassName` compatibility props.
- Consumes: `BRAND`, `GIRUMO_VIEWBOX`, `GIRUMO_PATHS`, generated `GIRUMO_WORDMARK_*` geometry, and generated icons.

- [ ] **Step 1: Write the failing render test**

```ts
// apps/web/src/components/brand/logo.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo, LogoSymbol } from "./logo";

test("renders the approved two-mass Girumo symbol", () => {
  const html = renderToStaticMarkup(createElement(LogoSymbol));
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.equal((html.match(/<path/g) || []).length, 2);
  assert.doesNotMatch(html, /mask|gradient|hf-link-mask/i);
});

test("renders the Girumo wordmark", () => {
  const html = renderToStaticMarkup(createElement(Logo));
  assert.match(html, /aria-label="Girumo"/);
  assert.equal((html.match(/data-girumo-wordmark-path/g) || []).length, 6);
  assert.doesNotMatch(html, /HubFlow/);
});
```

- [ ] **Step 2: Run the test and verify the missing component failure**

Run: `npm --workspace apps/web exec tsx -- --test src/components/brand/logo.test.ts`

Expected: FAIL because `./logo` does not exist.

- [ ] **Step 3: Implement the accessible component**

```tsx
// apps/web/src/components/brand/logo.tsx
import { BRAND } from "@/lib/brand";
import { GIRUMO_PATHS, GIRUMO_VIEWBOX } from "@/lib/girumo-symbol";
import { GIRUMO_WORDMARK_ASPECT_RATIO, GIRUMO_WORDMARK_PATHS, GIRUMO_WORDMARK_VIEWBOX } from "@/lib/girumo-wordmark";
import { cn } from "@/lib/utils";

export function LogoSymbol({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={GIRUMO_VIEWBOX}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {GIRUMO_PATHS.map((d) => <path key={d} d={d} fill="currentColor" />)}
    </svg>
  );
}

export function Logo({ className, symbolClassName, wordmarkClassName, title = BRAND.name }: {
  className?: string;
  symbolClassName?: string;
  wordmarkClassName?: string;
  title?: string | null;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-[0.28em]", className)}
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title === null ? true : undefined}
    >
      <LogoSymbol className={cn("relative top-[-0.015em] h-[1.06em] w-[1.06em] text-current", symbolClassName)} />
      <svg
        viewBox={GIRUMO_WORDMARK_VIEWBOX}
        aria-hidden="true"
        className={cn("h-[1em] fill-current", wordmarkClassName)}
        style={{ width: `${GIRUMO_WORDMARK_ASPECT_RATIO}em` }}
      >
        {GIRUMO_WORDMARK_PATHS.map((glyph) => (
          <path key={`${glyph.d}-${glyph.transform}`} d={glyph.d} transform={glyph.transform} data-girumo-wordmark-path="" />
        ))}
      </svg>
    </span>
  );
}
```

The React lockup consumes the generated six-path wordmark module, so its pair spacing is byte-for-byte derived from the exporter rather than browser kerning. It uses the same optical contract as the outlined exporter: symbol height `1.06em`, gap `0.28em` (the measured half-width of Manrope Bold `o` at this scale), and vertical correction `-0.015em`. Add render assertions for the path count and these three classes so later refactors cannot drift from the exported lockup. Also test `title={null}` to confirm decorative lockups become `aria-hidden`.

- [ ] **Step 4: Update all importers and remove the old component**

Replace `@/components/landing/logo` with `@/components/brand/logo` in all tracked importers. Delete the old file only after `rg -n 'components/landing/logo' apps/web` returns no consumers.

- [ ] **Step 5: Wire App Router icons and manifest**

Copy generated icon files:

```powershell
Copy-Item apps/web/public/brand/girumo/svg/girumo-symbol-volt.svg apps/web/src/app/icon.svg
Copy-Item apps/web/public/brand/girumo/favicon.ico apps/web/src/app/favicon.ico
Copy-Item apps/web/public/brand/girumo/png/symbol-180.png apps/web/src/app/apple-icon.png
```

Create:

```ts
// apps/web/src/app/manifest.ts
import type { MetadataRoute } from "next";
import { BRAND, BRAND_COLORS } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_COLORS.canvas,
    theme_color: BRAND_COLORS.volt,
    icons: [
      { src: "/brand/girumo/png/symbol-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/girumo/png/symbol-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcuts: [
      { name: "Girumo Campanhas", short_name: "Campanhas", url: "/painel/campanhas", icons: [{ src: "/brand/girumo/png/symbol-192.png", sizes: "192x192" }] },
      { name: "Girumo Grupos", short_name: "Grupos", url: "/painel/grupos", icons: [{ src: "/brand/girumo/png/symbol-192.png", sizes: "192x192" }] },
      { name: "Girumo Pages", short_name: "Pages", url: "/painel/pages", icons: [{ src: "/brand/girumo/png/symbol-192.png", sizes: "192x192" }] },
    ],
  };
}
```

- [ ] **Step 6: Run component tests, typecheck, and build**

```powershell
npm --workspace apps/web exec tsx -- --test src/components/brand/logo.test.ts
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm run web:build
```

Expected: PASS; generated routes include `/manifest.webmanifest` and no duplicate SVG mask IDs exist.

- [ ] **Step 7: Commit the logo integration**

```powershell
git add apps/web/src/components/brand/logo.tsx apps/web/src/components/brand/logo.test.ts apps/web/src/app/icon.svg apps/web/src/app/favicon.ico apps/web/src/app/apple-icon.png apps/web/src/app/manifest.ts apps/web/src/app/page.tsx apps/web/src/components/auth-shell.tsx apps/web/src/components/admin/sidebar.tsx apps/web/src/components/painel/sidebar.tsx apps/web/src/components/painel/topbar.tsx apps/web/src/components/painel/mobile-nav.tsx apps/web/src/components/landing/v2/nav.tsx apps/web/src/components/landing/logo.tsx
git commit -m "feat: integrate Girumo logo and app icons"
```

---

### Task 4: Consolidate Fonts, Tokens, and Shared Primitives

**Files:**
- Create: `apps/web/src/lib/brand-css.test.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/ui/{button,input,card,badge,skeleton}.tsx`
- Modify: `apps/web/src/components/painel/empty-state.tsx`

**Interfaces:**
- Produces CSS tokens: `volt-*`, `acid-500`, `cobalt-*`, `canvas-100`, `paper-0`, `slate-600`, `line-200`, `font-brand`, `font-body`, `font-data`.
- Temporary compatibility aliases: `breu`, `breu-2`, `bruma`, `iris`, `iris-claro`, `iris-escuro`; values map to Girumo colors until Task 12 removes remaining consumers.

- [ ] **Step 1: Write the failing CSS contract test**

```ts
// apps/web/src/lib/brand-css.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

test("defines the Volt Commerce token contract", () => {
  for (const value of ["#071923", "#0C2835", "#123746", "#A7FF2F", "#2E66FF", "#F4F0E7", "#1947C9"]) {
    assert.match(css.toUpperCase(), new RegExp(value.toUpperCase()));
  }
});

test("defines Girumo layout, type, control, icon, and motion contracts", () => {
  for (const value of ["--space-unit: 4px", "--content-max: 1200px", "--reading-max: 720px", "--radius-control: 8px", "--radius-card: 12px", "--radius-panel: 16px", "--control-height: 40px", "--control-height-prominent: 48px", "--icon-stroke: 1.75", "--ease-girumo: cubic-bezier(0.22, 1, 0.36, 1)"]) {
    assert.match(css, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("removes the purple HubFlow palette", () => {
  const normalized = css.replace(/\s+/g, "").toUpperCase();
  for (const value of ["#7C5CFF", "#6A4BF0", "#8A6CFF", "#3D1FB0", "#A78CFF", "#3D5AF1", "#9A82FF", "#B9ABFF", "#6A45F0", "#5836C9", "#46299E", "#F3F1FF", "#E9E5FF", "#D6CEFF", "rgba(106,75,240", "rgba(88,54,201"]) {
    assert.equal(normalized.includes(value.toUpperCase()), false, value);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails on legacy purple values**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/brand-css.test.ts`

Expected: FAIL on the first purple value.

- [ ] **Step 3: Reduce root fonts to Manrope and IBM Plex**

In `layout.tsx`, remove Bricolage Grotesque, Instrument Serif, and Space Grotesk. Add Manrope and keep IBM Plex Sans/Mono. The `<html>` class must inject only:

```tsx
`${manrope.variable} ${plexSans.variable} ${plexMono.variable}`
```

Use these variables:

```css
--font-brand: var(--font-manrope), sans-serif;
--font-body: var(--font-plex-sans), sans-serif;
--font-data: var(--font-plex-mono), monospace;
```

- [ ] **Step 4: Replace the global palette and effects**

Define the complete named contract in `@theme`: `volt-950 #071923`, `volt-900 #0C2835`, `volt-800 #123746`, `acid-500 #A7FF2F`, `cobalt-500 #2E66FF`, `cobalt-700 #1947C9`, `canvas-100 #F4F0E7`, `paper-0 #FFFEFA`, `slate-600 #52646C`, `line-200 #D8D7CF`, `success-700 #0C7346`, `warning-700 #7A4A00`, `danger-700 #B82936`, and `info-700 #1947C9`. Map temporary aliases to it, replace every purple hex/RGBA, remove aurora/eclipses/shimmer gradients, and make selection Acid with Volt text. Keep WhatsApp `#25D366` only where it identifies WhatsApp.

Add the full product foundation as CSS tokens, not page-local values:

```css
--space-unit: 4px;
--content-max: 1200px;
--reading-min: 640px;
--reading-max: 720px;
--radius-control: 8px;
--radius-card: 12px;
--radius-panel: 16px;
--control-height: 40px;
--control-height-prominent: 48px;
--icon-stroke: 1.75;
--duration-micro: 180ms;
--duration-page: 280ms;
--ease-girumo: cubic-bezier(0.22, 1, 0.36, 1);
```

Define named typography utilities for Display XL `64/64` (`44/46` mobile), Display L `48/52` (`36/40` mobile), H1 `32/38`, H2 `24/30` weight 650, H3 `20/26` weight 650, Body L `18/28`, Body M `16/24`, Body S `14/20`, Label `12/16` weight 600, and Data `12/16` IBM Plex Mono weight 500. Add a reduced-motion media rule that collapses branded transitions to `1ms` and prevents looping decorative animation.

Primary button contract:

```ts
primary: "bg-acid-500 text-volt-950 shadow-sm hover:brightness-95 active:brightness-90"
```

Focus contract:

```ts
"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
```

- [ ] **Step 5: Update shared primitives**

Apply the new primary, secondary, outline, focus, card, input, badge, skeleton, and empty-state rules. Buttons and inputs consume the 40/48 px control tokens; cards consume 12 px, marketing panels 16 px, and controls 8 px radii. Line icons use the shared 1.75 px stroke value. Replace the hardcoded `rgba(106,75,240,0.15)` in `ui/input.tsx` with the Cobalt token.

- [ ] **Step 6: Run tests, lint, and typecheck**

```powershell
npm --workspace apps/web exec tsx -- --test src/lib/brand-css.test.ts
npm run web:lint
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
```

Expected: PASS; no purple hex remains in `globals.css` or shared primitives.

- [ ] **Step 7: Commit the foundation**

```powershell
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css apps/web/src/lib/brand-css.test.ts apps/web/src/components/ui/button.tsx apps/web/src/components/ui/input.tsx apps/web/src/components/ui/card.tsx apps/web/src/components/ui/badge.tsx apps/web/src/components/ui/skeleton.tsx apps/web/src/components/painel/empty-state.tsx
git commit -m "feat: apply Girumo typography and design tokens"
```

---

### Task 5: Migrate Auth, Panel, and Admin Shells

**Files:**
- Modify: `apps/web/src/components/auth-shell.tsx`
- Modify: `apps/web/src/app/{login,signup,forgot-password,reset-password}/page.tsx`
- Modify: `apps/web/src/components/signup-progress.tsx`
- Modify: `apps/web/src/app/painel/layout.tsx`
- Modify: `apps/web/src/app/painel/page.tsx`
- Modify: `apps/web/src/app/painel/campanhas/nova/page.tsx`
- Modify: `apps/web/src/components/painel/{sidebar,topbar,mobile-nav,campaign-config,plan-gate}.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/components/admin/sidebar.tsx`
- Modify: `apps/web/src/components/billing-panel.tsx`

**Interfaces:**
- Consumes: central `Logo`, `BRAND`, Volt tokens.
- Produces: consistent persistent identity on all public auth and authenticated shells.

- [ ] **Step 1: Capture the failing residual-name search**

Run:

```powershell
rg -n "HubFlow|WhatsApp Growth OS|#6A4BF0|#3D5AF1" apps/web/src/components/auth-shell.tsx apps/web/src/app/login apps/web/src/app/signup apps/web/src/app/forgot-password apps/web/src/app/reset-password apps/web/src/app/painel/layout.tsx apps/web/src/app/painel/page.tsx apps/web/src/app/painel/campanhas/nova/page.tsx apps/web/src/components/painel apps/web/src/app/admin/layout.tsx apps/web/src/components/admin/sidebar.tsx apps/web/src/components/billing-panel.tsx
```

Expected: matches for old name, old subtitle, and hardcoded accents.

- [ ] **Step 2: Migrate auth copy and visual treatment**

Use these exact replacements in `AuthShell`:

- heading: `Seus grupos rodando. Você vendendo.`
- paragraph: `A Girumo organiza grupos, campanhas e agendamentos enquanto você foca no atendimento e nas vendas.`
- footer: `© {ano} Girumo · Automação para grupos que vendem`
- checklist item: `Envie ofertas para todos os grupos sem repetir o trabalho`

Remove both blurred gradient circles and use a flat Volt background with one restrained displaced-block decoration.

- [ ] **Step 3: Migrate panel and admin persistent surfaces**

Set metadata to `Painel — Girumo` and `Admin — Girumo`. Change `Bem-vindo ao HubFlow` to `Bem-vindo à Girumo`. Replace public copy in campaign config and billing fallback. Keep internal `Squad OS`, environment keys, and admin email domains unchanged.

- [ ] **Step 4: Remove shell hardcodes and re-run the search**

Expected: no `HubFlow`, `WhatsApp Growth OS`, `#6A4BF0`, or `#3D5AF1` in the listed shell files. `service: "hubflow-web"` is outside this scope and remains.

- [ ] **Step 5: Run tests, typecheck, and build**

```powershell
npm --workspace apps/web test
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm run web:build
```

Expected: PASS.

- [ ] **Step 6: Commit shell migration**

```powershell
git add apps/web/src/components/auth-shell.tsx apps/web/src/app/login/page.tsx apps/web/src/app/signup/page.tsx apps/web/src/app/forgot-password/page.tsx apps/web/src/app/reset-password/page.tsx apps/web/src/components/signup-progress.tsx apps/web/src/app/painel/layout.tsx apps/web/src/app/painel/page.tsx apps/web/src/app/painel/campanhas/nova/page.tsx apps/web/src/components/painel/sidebar.tsx apps/web/src/components/painel/topbar.tsx apps/web/src/components/painel/mobile-nav.tsx apps/web/src/components/painel/campaign-config.tsx apps/web/src/components/painel/plan-gate.tsx apps/web/src/app/admin/layout.tsx apps/web/src/components/admin/sidebar.tsx apps/web/src/components/billing-panel.tsx
git commit -m "feat: migrate Girumo application shells"
```

---

### Task 6: Migrate the Primary Marketing Landing

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/landing/v2/{nav,compare,faq,features,mechanism,lp-showcase}.tsx`
- Verify visually: `flow-canvas.tsx`, `landing-fx.tsx`, `pricing.tsx`, `group-wall.tsx`

**Interfaces:**
- Consumes: `BRAND`, `getPublicSiteUrl()`, central `Logo`, Volt tokens.
- Produces: canonical Girumo landing, metadata copy inputs, honest public proof.

- [ ] **Step 1: Capture old-brand matches**

```powershell
rg -n -i "hubflow|o fluxo que vende|#6a4bf0|#7c5cff" apps/web/src/app/page.tsx apps/web/src/components/landing/v2
```

Expected: matches in metadata, JSON-LD, CTA text, FAQ, mechanism, comparison, and example URLs.

- [ ] **Step 2: Replace brand copy without changing proof claims**

Use `BRAND.name`, `BRAND.tagline`, and `BRAND.description` for title, JSON-LD, Open Graph, hero support, and footer. Replace:

- `sem o hubflow` → `sem a Girumo`
- `com o hubflow` → `com a Girumo`
- `O HubFlow lota...` → `A Girumo ajuda a lotar seus grupos, organiza a operação e publica sua oferta sem repetir o trabalho.`
- `dispara` → `envia` or `publica`, according to sentence grammar.

Keep Mega Stock numbers and founder-market proof unchanged.

- [ ] **Step 3: Replace literal demo hosts with the configured host**

Use `getPublicSiteUrl()` in server components. For client-only mockups, pass the host as a prop from `page.tsx`; do not hardcode an unowned Girumo domain.

- [ ] **Step 4: Apply Volt visual language**

Remove aurora/eclipses and generic purple gradients. Use navy surfaces, canvas sections, Acid for the single primary CTA, Cobalt for focus/selection, and displaced blocks as section dividers.

- [ ] **Step 5: Audit photography and image treatment**

Inventory every photograph and product mockup used by the canonical landing. Keep only real wholesale operations—inventory, order separation, mobile use in context, groups, and behind-the-scenes selling—with natural light or controlled flash and close framing. Reject generic office people, robots/AI imagery, detached phone mockups, traffic-agency aesthetics, editorial fashion imagery, and fabricated dashboards. When treatment is required, use a 12–28% Volt overlay, orthogonal crop with one displacement, and Acid only for labels or signals, never as a photo filter.

- [ ] **Step 6: Re-run the residual search and build**

Expected: no old brand/copy/purple in the listed files.

Run:

```powershell
npm run web:lint
npm run web:build
```

- [ ] **Step 7: Commit the canonical landing**

```powershell
git add apps/web/src/app/page.tsx apps/web/src/components/landing/v2/nav.tsx apps/web/src/components/landing/v2/compare.tsx apps/web/src/components/landing/v2/faq.tsx apps/web/src/components/landing/v2/features.tsx apps/web/src/components/landing/v2/mechanism.tsx apps/web/src/components/landing/v2/lp-showcase.tsx
git commit -m "feat: rebrand canonical landing as Girumo"
```

---

### Task 7: Migrate Experimental Landings and Customer Pages

**Files:**
- Modify: `apps/web/src/app/lp/page.tsx`
- Modify: `apps/web/src/app/lp/lp.css`
- Modify: `apps/web/src/app/lp2/page.tsx`
- Modify: `apps/web/src/app/lp2/lp2.css`
- Modify: `apps/web/src/components/lp/{nav,calculator}.tsx`
- Modify: `apps/web/src/components/lp2/{nav,panel-mock}.tsx`
- Modify: `apps/web/src/components/pages/templates/basic.tsx`
- Modify: `apps/web/src/components/pages/editor/preview.tsx`
- Modify: `apps/web/src/lib/pages/slug.ts`

**Interfaces:**
- Consumes: brand contract and generated logo assets.
- Produces: consistent Girumo identity on `/lp`, `/lp2`, public customer pages, and editor preview.

- [ ] **Step 1: Capture old brand and font imports**

```powershell
rg -n -i "hubflow|outfit|archivo|martian|#6a4bf0|#7c5cff" apps/web/src/app/lp apps/web/src/app/lp2 apps/web/src/components/lp apps/web/src/components/lp2 apps/web/src/components/pages
```

- [ ] **Step 2: Remove page-specific font families**

Delete Outfit, Archivo, and Martian Mono imports. Point `.lp3` and `.lp4` roots to `--font-brand`, `--font-body`, and `--font-data`. Preserve layout structure; this task is a brand migration, not a funnel rewrite.

- [ ] **Step 3: Replace names, wordmarks, and examples**

Use Girumo copy and central `Logo`. Change public footer to `Página criada com Girumo`. Use the configured site host in previews. Keep the existing routes and `noindex` directives.

- [ ] **Step 4: Reserve both old and new slugs**

Ensure the reserved slug set includes both `hubflow` and `girumo`; add a focused assertion to the existing slug test or create `apps/web/src/lib/pages/slug.test.ts` if no slug test exists.

- [ ] **Step 5: Apply the same photography gate to `/lp` and `/lp2`**

Use the Task 6 image-direction criteria. Do not retain an image only because it belonged to the old landing; every retained or replaced visual must depict a plausible wholesale selling operation and follow the Volt overlay/crop rules.

- [ ] **Step 6: Re-run search, tests, and build**

```powershell
npm --workspace apps/web test
npm run web:build
```

Expected: no old brand or removed font imports in the listed files; both slugs are rejected.

- [ ] **Step 7: Commit secondary public surfaces**

```powershell
git add apps/web/src/app/lp/page.tsx apps/web/src/app/lp/lp.css apps/web/src/app/lp2/page.tsx apps/web/src/app/lp2/lp2.css apps/web/src/components/lp/nav.tsx apps/web/src/components/lp/calculator.tsx apps/web/src/components/lp2/nav.tsx apps/web/src/components/lp2/panel-mock.tsx apps/web/src/components/pages/templates/basic.tsx apps/web/src/components/pages/editor/preview.tsx apps/web/src/lib/pages/slug.ts apps/web/src/lib/pages/slug.test.ts
git commit -m "feat: migrate Girumo public page surfaces"
```

---

### Task 8: Centralize Metadata, Robots, Sitemap, and Domain Compatibility

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/robots.ts`
- Modify: `apps/web/src/app/sitemap.ts`
- Modify: `apps/web/src/app/p/[slug]/page.tsx`
- Create: `apps/web/src/app/brand-routes.test.ts`
- Modify: `apps/web/.env.production.example`
- Modify: `deploy/vercel/.env.production.example`

**Interfaces:**
- Consumes: `BRAND`, `getPublicSiteUrl()`, generated OG asset.
- Produces: domain-configurable metadata with old host fallback and no broken OG path.

- [ ] **Step 1: Write route metadata tests**

```ts
// apps/web/src/app/brand-routes.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import manifest from "./manifest";
import robots from "./robots";
import sitemap from "./sitemap";

test("publishes Girumo install metadata", () => {
  assert.equal(manifest().name, "Girumo");
  assert.equal(manifest().theme_color, "#071923");
  assert.equal(manifest().icons?.length, 2);
  assert.deepEqual(manifest().shortcuts?.map((item) => item.url), ["/painel/campanhas", "/painel/grupos", "/painel/pages"]);
});

test("uses NEXT_PUBLIC_SITE_URL for discovery routes", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    assert.equal(robots().host, "https://example.test");
    assert.equal(sitemap()[0].url, "https://example.test");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
```

- [ ] **Step 2: Make discovery files consume the brand contract**

Replace repeated `SITE_URL` constants with `getPublicSiteUrl()`. Set root metadata title to `Girumo — Mais grupos lotados. Menos trabalho. Mais vendas.` and template to `%s | Girumo`.

- [ ] **Step 3: Fix the missing Open Graph asset**

Replace `/product/painel-home.png` with `BRAND.ogAsset` in Open Graph and Twitter metadata. Confirm the generated file exists before build.

- [ ] **Step 4: Add explicit site URL configuration**

Add `NEXT_PUBLIC_SITE_URL=https://hubflow.com.br` to both production environment templates with a comment that it must switch only after the Girumo domain is acquired. Preserve old-domain allowlists and runtime fallbacks.

- [ ] **Step 5: Run metadata tests and build**

```powershell
npm --workspace apps/web exec tsx -- --test src/app/brand-routes.test.ts
npm run web:build
```

Expected: PASS; metadata no longer references the missing `/product/painel-home.png`.

- [ ] **Step 6: Commit discovery migration**

```powershell
git add apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts apps/web/src/app/p/[slug]/page.tsx apps/web/src/app/brand-routes.test.ts apps/web/.env.production.example deploy/vercel/.env.production.example
git commit -m "feat: publish Girumo metadata and manifest"
```

---

### Task 9: Migrate Transactional Email and Automated Messages

**Files:**
- Modify: `apps/web/src/lib/email/templates.ts`
- Modify: `apps/web/src/lib/email/client.ts`
- Modify: `apps/web/src/lib/stores/automations.ts`
- Modify: `apps/web/src/app/api/auth/signup/route.ts`
- Modify: `apps/web/src/app/api/cron/emails/route.ts`
- Create: `apps/web/src/lib/email/brand-copy.test.ts`

**Interfaces:**
- Consumes: brand name, palette, `getBrandAssetUrl()`, legacy app URL fallback.
- Produces: Girumo sender identity and templates without changing delivery infrastructure.

- [ ] **Step 1: Write a static email brand gate**

```ts
// apps/web/src/lib/email/brand-copy.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const files = ["templates.ts", "client.ts"];

test("email sources use Girumo public identity", () => {
  const source = files.map((file) => readFileSync(path.join(process.cwd(), "src/lib/email", file), "utf8")).join("\n");
  assert.match(source, /Girumo/);
  assert.doesNotMatch(source, /HubFlow|WhatsApp Growth OS|#6a4bf0/i);
});
```

- [ ] **Step 2: Run the gate and verify failure**

Run: `npm --workspace apps/web exec tsx -- --test src/lib/email/brand-copy.test.ts`

Expected: FAIL on HubFlow and purple.

- [ ] **Step 3: Update templates and sender**

Use `BRAND.name`, `BRAND.emailFooter`, Acid button with Volt text, Canvas email background, and an absolute URL to `BRAND.emailLogoAsset`. Render the dedicated 640×160 PNG at 320×80 CSS pixels with descriptive alt text; do not embed or remotely reference SVG in transactional e-mail. Transitional fallback sender is `Girumo <noreply@hubflow.com.br>` until `RESEND_FROM_EMAIL` is configured on a cleared Girumo domain.

Replace `disparos` with `envios` or `campanhas` in user-facing email copy. Do not change the old app URL fallback yet.

- [ ] **Step 4: Update automated message copy**

Replace brand references in `automations.ts`. Keep signup and cron fallbacks on `https://app.hubflow.com.br`; those are compatibility URLs, not brand labels.

- [ ] **Step 5: Run email gate and web tests**

```powershell
npm --workspace apps/web exec tsx -- --test src/lib/email/brand-copy.test.ts
npm --workspace apps/web test
```

Expected: PASS.

- [ ] **Step 6: Commit transactional migration**

```powershell
git add apps/web/src/lib/email/templates.ts apps/web/src/lib/email/client.ts apps/web/src/lib/email/brand-copy.test.ts apps/web/src/lib/stores/automations.ts apps/web/src/app/api/auth/signup/route.ts apps/web/src/app/api/cron/emails/route.ts
git commit -m "feat: migrate Girumo transactional communication"
```

---

### Task 10: Rebrand the Social Post Generator

**Files:**
- Modify: `apps/web/src/app/posts/layout.tsx`
- Modify: `apps/web/src/app/posts/page.tsx`
- Modify: `apps/web/src/app/posts/og/route.tsx`
- Modify: `apps/web/src/components/posts/post-gallery.tsx`
- Create: `apps/web/src/app/posts/post-formats.ts`
- Create: `apps/web/src/app/posts/post-formats.test.ts`

**Interfaces:**
- Consumes: symbol geometry, brand contract, Manrope/Plex font system, Volt colors.
- Produces: Girumo-branded square, portrait, story, video-cover, proof, and metric layouts with `girumo-post-*.png` downloads.

- [ ] **Step 1: Write the failing format-contract test**

Create a typed format map with these exact output sizes:

```ts
assert.deepEqual(POST_FORMATS.square, { width: 1080, height: 1080 });
assert.deepEqual(POST_FORMATS.portrait, { width: 1080, height: 1350 });
assert.deepEqual(POST_FORMATS.story, { width: 1080, height: 1920 });
assert.deepEqual(POST_FORMATS.videoCover, { width: 1920, height: 1080 });
```

Run: `npm --workspace apps/web exec tsx -- --test src/app/posts/post-formats.test.ts`

Expected: FAIL because `post-formats.ts` does not exist.

- [ ] **Step 2: Implement the format contract and capture old social identity**

Implement `POST_FORMATS` as a typed immutable map, then run:

```powershell
rg -n -i "hubflow|o fluxo que vende|bricolage|#6a4bf0|#8a6cff" apps/web/src/app/posts apps/web/src/components/posts
```

Expected: old inline symbol, name, domain, slogan, font, and color matches.

- [ ] **Step 3: Replace frame identity**

Import `GIRUMO_PATHS`, `BRAND`, and `BRAND_COLORS`. Render the approved two-path symbol inline. Load Manrope instead of Bricolage. Use flat Volt background, Canvas text, Acid focal elements, and no eclipse or grid overlay.

- [ ] **Step 4: Add the required social applications**

Make the renderer accept `format=square|portrait|story|videoCover` and derive the image dimensions from `POST_FORMATS`. Provide reusable content modes for product message, video thumbnail, customer proof, and metric card. Preserve the approved 58–64% symbol occupancy in avatar-only compositions and the circular-crop safe area.

- [ ] **Step 5: Update public copy and downloads**

Replace old name/slogan and change the download filename to `girumo-post-${id}-${format}.png` so exports of the same post never collide across aspect ratios. Keep the factual product and case-study content; replace `dispara` with `envia` or `publica`.

- [ ] **Step 6: Re-run tests, residual search, and fetch representative images**

Run the dev server and request:

```text
/posts/og?t=1.1-capa&format=square
/posts/og?t=2.3-capa&format=portrait
/posts/og?t=3.1-numero&format=story
/posts/og?t=1.1-capa&format=videoCover
```

Run the targeted format test before the visual requests. Read each response buffer with Sharp and assert its exact `POST_FORMATS` dimensions and `srgb` color space. Expected: test PASS; every image returns HTTP 200 with the correct dimensions/profile, no clipped wordmark, and no old symbol/name/color.

- [ ] **Step 7: Commit social generator migration**

```powershell
git add apps/web/src/app/posts/layout.tsx apps/web/src/app/posts/page.tsx apps/web/src/app/posts/og/route.tsx apps/web/src/app/posts/post-formats.ts apps/web/src/app/posts/post-formats.test.ts apps/web/src/components/posts/post-gallery.tsx
git commit -m "feat: rebrand Girumo social generator"
```

---

### Task 11: Publish the Girumo Brand Guide and Design-Sync Package

**Files:**
- Create: `docs/brand/girumo/README.md`
- Create: `docs/brand/girumo/design-tokens.css`
- Create: `docs/brand/girumo/copy-library.md`
- Create: `docs/brand/girumo/Girumo-Brand-Guide.html`
- Create: `docs/brand/girumo/templates/social/girumo-social-square-1080x1080.svg`
- Create: `docs/brand/girumo/templates/social/girumo-social-portrait-1080x1350.svg`
- Create: `docs/brand/girumo/templates/social/girumo-social-story-1080x1920.svg`
- Create: `docs/brand/girumo/templates/social/girumo-video-cover-1920x1080.svg`
- Create: `docs/brand/girumo/templates/social/girumo-customer-proof-1080x1350.svg`
- Create: `docs/brand/girumo/templates/social/girumo-metric-card-1080x1350.svg`
- Create: `docs/brand/girumo/templates/commercial/girumo-one-page.html`
- Create: `docs/brand/girumo/templates/commercial/girumo-email-signature.html`
- Create: `docs/brand/girumo/templates/commercial/girumo-digital-card.svg`
- Create: `docs/brand/girumo/templates/commercial/girumo-onboarding-cover.svg`
- Generate: `docs/brand/girumo/templates/commercial/girumo-proposal-template.docx`
- Generate: `docs/brand/girumo/templates/commercial/girumo-proposal-template.pdf`
- Generate: `docs/brand/girumo/templates/commercial/girumo-sales-deck.pptx`
- Generate: `docs/brand/girumo/templates/commercial/girumo-one-page.pdf`
- Create: `docs/brand/girumo/templates/commercial/girumo-onboarding-guide.html`
- Generate: `docs/brand/girumo/templates/commercial/girumo-onboarding-guide.pdf`
- Generate: `apps/web/public/brand/girumo/girumo-brand-guide.pdf`
- Create: `docs/brand/legacy-hubflow/README.md`
- Modify: `.design-sync/config.json`
- Modify: `.design-sync/conventions.md`
- Modify: `.design-sync/ds-input.css`
- Modify: `.design-sync/previews/{Logo,LogoSymbol}.tsx`
- Generate locally (ignored): `apps/web/.ds-entry.tsx`
- Regenerate locally (ignored): `apps/web/.ds-styles.css`, `ds-bundle/**`

**Interfaces:**
- Consumes: approved spec, generated assets, central logo component, Volt tokens.
- Produces: human-readable operational guide, exportable PDF, social source templates, commercial starter kit, versioned design-sync sources, a locally validated ephemeral bundle, and explicit legacy archive boundary.

- [ ] **Step 1: Create the current operational guide**

Write the guide from the approved spec, including:

- strategy and promise;
- symbol construction and misuse;
- lockups and clear space;
- palette and contrast ratios;
- typography and scale;
- UI foundations;
- social/avatar examples;
- copy rules;
- official pronunciation and Girumo Pages/Grupos/Campanhas/Agenda/Resultados architecture;
- photography subjects, prohibited imagery, 12–28% Volt overlay, orthogonal crop, and Acid-label rules;
- asset directory and filenames.

Do not copy purple HubFlow mockups into the Girumo guide.

- [ ] **Step 2: Create the reusable social source templates**

Create editable SVG masters for square `1080×1080`, portrait `1080×1350`, story `1080×1920`, video cover `1920×1080`, customer proof, and metric card. Use real Girumo sample copy from `copy-library.md`, outlined logo assets, flat Volt/Canvas surfaces, and Acid only as a focal signal. Verify each artboard at 100% and thumbnail size.

- [ ] **Step 3: Create the one-page and lightweight commercial applications**

Build a one-page HTML/PDF with the promise, capture→groups→campaigns→sales workflow, five-module architecture, operational benefits, and next action. Build the HTML email signature with `{{nome}}`, `{{cargo}}`, `{{telefone}}`, and `{{email}}` fields; the digital card with the same contact fields plus site URL; and an onboarding cover with customer name, start date, and responsible consultant fields. Also create a five-page onboarding HTML/PDF: welcome; first-seven-days checklist; five-module map; recommended operating routine; next steps and support contacts. Use approved claims only and no invented customer numbers.

- [ ] **Step 4: Create and verify the proposal DOCX**

Load the `documents:documents` skill. Build a seven-page editable proposal: cover; context and goals; operating problem; Girumo solution and workflow; scope/modules; investment and terms; next steps/contact. Use consistent `{{empresa}}`, `{{responsavel}}`, `{{data}}`, `{{plano}}`, `{{investimento}}`, and `{{validade}}` fields. Render through the document skill's required verification flow, export the matching seven-page `girumo-proposal-template.pdf`, and inspect every DOCX/PDF page at normal zoom.

- [ ] **Step 5: Create and verify the sales-deck PPTX**

Load the `presentations:Presentations` skill. Build nine 16:9 slides: cover; promise; wholesale-group pain; full Girumo journey; five modules; product proof framework; how implementation works; offer/next action; contact. Use actual product UI or clearly labeled schematic product frames, never a fabricated dashboard. Render through the presentation skill's required verification flow and inspect the slide montage plus every full-size slide.

- [ ] **Step 6: Verify the complete commercial starter kit**

Load the `pdf:pdf` skill for the proposal, one-page, and onboarding PDFs. Verify the DOCX and proposal PDF have seven pages, the PPTX has nine slides, the one-page PDF has one page, the onboarding guide has five pages with all required sections, all lightweight HTML/SVG applications open without missing assets, fonts resolve to Manrope/IBM Plex, every logo is monochromatic, and every editable field remains present. Record the check in `docs/brand/girumo/README.md`.

- [ ] **Step 7: Preserve legacy documentation explicitly**

Create `docs/brand/legacy-hubflow/README.md` listing the old files as historical references. Do not rewrite or delete the old Brand Book, screenshots, calendars, benchmarks, or campaign evidence.

- [ ] **Step 8: Render and verify the brand-guide PDF**

Use the PDF creation skill against `Girumo-Brand-Guide.html`. Save the verified output to `apps/web/public/brand/girumo/girumo-brand-guide.pdf`. Inspect every page for clipping, embedded fonts, color consistency, and selectable text where applicable.

- [ ] **Step 9: Update design-sync sources**

Set `globalName` to `Girumo`, point previews to `@/components/brand/logo`, copy the production Volt tokens into `ds-input.css`, and create the ignored `.ds-entry.tsx` only as a local build input. Regenerate and validate with the available local design-sync toolchain:

```powershell
$designSyncToolRoot = if (Test-Path ".ds-sync") { (Resolve-Path ".ds-sync").Path } else { (Resolve-Path "..\..\.ds-sync").Path }
& "$designSyncToolRoot\node_modules\.bin\tailwindcss.cmd" -i .design-sync/ds-input.css -o apps/web/.ds-styles.css
node "$designSyncToolRoot\package-build.mjs" --config .design-sync/config.json --node-modules ./node_modules --entry apps/web/.ds-entry.tsx --out ./ds-bundle
node "$designSyncToolRoot\package-validate.mjs" ./ds-bundle --no-render-check
```

Expected: bundle validation PASS; exports are `Logo` and `LogoSymbol`; preview shows Girumo.

- [ ] **Step 10: Commit documentation and design-sync**

```powershell
git add docs/brand/girumo/README.md docs/brand/girumo/design-tokens.css docs/brand/girumo/copy-library.md docs/brand/girumo/Girumo-Brand-Guide.html docs/brand/girumo/templates/social/girumo-social-square-1080x1080.svg docs/brand/girumo/templates/social/girumo-social-portrait-1080x1350.svg docs/brand/girumo/templates/social/girumo-social-story-1080x1920.svg docs/brand/girumo/templates/social/girumo-video-cover-1920x1080.svg docs/brand/girumo/templates/social/girumo-customer-proof-1080x1350.svg docs/brand/girumo/templates/social/girumo-metric-card-1080x1350.svg docs/brand/girumo/templates/commercial/girumo-one-page.html docs/brand/girumo/templates/commercial/girumo-email-signature.html docs/brand/girumo/templates/commercial/girumo-digital-card.svg docs/brand/girumo/templates/commercial/girumo-onboarding-cover.svg docs/brand/girumo/templates/commercial/girumo-proposal-template.docx docs/brand/girumo/templates/commercial/girumo-proposal-template.pdf docs/brand/girumo/templates/commercial/girumo-sales-deck.pptx docs/brand/girumo/templates/commercial/girumo-one-page.pdf docs/brand/girumo/templates/commercial/girumo-onboarding-guide.html docs/brand/girumo/templates/commercial/girumo-onboarding-guide.pdf docs/brand/legacy-hubflow/README.md apps/web/public/brand/girumo/girumo-brand-guide.pdf .design-sync/config.json .design-sync/conventions.md .design-sync/ds-input.css .design-sync/previews/Logo.tsx .design-sync/previews/LogoSymbol.tsx
git commit -m "docs: publish Girumo brand guide"
```

Confirm `git status --ignored --short -- apps/web/.ds-entry.tsx apps/web/.ds-styles.css ds-bundle` reports only ignored build artifacts. Do not stage them.

---

### Task 12: Add the Brand Audit Gate and Complete the Migration

**Files:**
- Create: `apps/web/scripts/check-girumo-brand.mjs`
- Modify: `apps/web/package.json`
- Modify: `infra/scripts/verify-online.ps1`
- Modify residual public files reported by the audit
- Remove only unused old assets from `apps/web/public/brand/` after references are zero

**Interfaces:**
- Produces: `npm run brand:check` and updated online smoke assertion.
- Preserves: internal `hubflow-web` service name and old-domain compatibility.

- [ ] **Step 1: Implement the public-surface scanner**

The scanner recursively checks these roots:

```js
const roots = [
  "src/app",
  "src/components",
  "src/lib/email",
  "src/lib/stores/automations.ts",
  "src/lib/pages/slug.ts",
];

const forbidden = [
  /\bhubflow\b/gi,
  /WhatsApp Growth OS/gi,
  /O fluxo que vende/gi,
  /#(?:7C5CFF|6A4BF0|8A6CFF|3D1FB0|A78CFF|3D5AF1|9A82FF|B9ABFF|6A45F0|5836C9|46299E|F3F1FF|E9E5FF|D6CEFF)\b/gi,
  /rgba?\(\s*(?:106\s*,\s*75\s*,\s*240|124\s*,\s*92\s*,\s*255|61\s*,\s*31\s*,\s*176|88\s*,\s*54\s*,\s*201)\b[^)]*\)/gi,
  /symbol-iris-gradient|lockup-horizontal-(?:dark|light)/gi,
];
```

Scan only `.ts`, `.tsx`, `.css`, `.html`, and `.svg` sources and skip `*.test.ts`, `*.test.tsx`, generated folders, and binary files. Before applying `forbidden`, redact only these documented compatibility values with same-length spaces so line numbers remain stable: `https://hubflow.com.br`, `https://app.hubflow.com.br`, `noreply@hubflow.com.br`, `igor@hubflow.com.br`, `hubflow-web`, `hubflow-engine`, `HUBFLOW_*` environment-key tokens, the exact `"hubflow.com"` hostname check in `src/app/api/admin/dev-tools/security-check/route.ts`, and the two reserved slug literals in `src/lib/pages/slug.ts`. The scanner must print `path:line:match`, identify whether an allowed value was redacted, and exit 1 for every non-allowlisted match. Never allowlist an entire production file.

Add:

```json
"brand:check": "node scripts/check-girumo-brand.mjs"
```

- [ ] **Step 2: Run the gate and fix every public residual**

Run: `npm --workspace apps/web run brand:check`

Expected first run: FAIL if any overlooked public string/color remains. Patch each reported public surface. Do not modify technical identifiers or historical docs to silence the gate; they are outside its roots.

- [ ] **Step 3: Update online verification**

In `infra/scripts/verify-online.ps1`, change the landing content assertion from `HUBFLOW` to `GIRUMO`. Keep the health check assertion `service === "hubflow-web"` unchanged.

- [ ] **Step 4: Remove transitional token aliases only when unused**

Run:

```powershell
rg -n "\b(?:iris|iris-claro|iris-escuro|breu|breu-2|bruma)\b" apps/web/src --glob '*.tsx' --glob '*.ts' --glob '*.css'
```

Replace remaining presentation references with Volt/Acid/Cobalt/Canvas semantic classes. Delete compatibility aliases from `globals.css` only when the search returns zero consumers.

- [ ] **Step 5: Remove or archive old active assets**

Confirm no imports reference:

- `apps/web/public/brand/symbol-iris-gradient.svg`
- `apps/web/public/brand/lockup-horizontal-dark.png`
- `apps/web/public/brand/lockup-horizontal-light.png`

Delete these three inactive public files after e-mail/cache compatibility is confirmed; their history remains available in Git and the legacy boundary is documented in Task 11. Do not move them to another publicly served path.

- [ ] **Step 6: Run the complete automated gate**

```powershell
npm --workspace apps/web run brand:export
npm --workspace apps/web run brand:check
npm test
npm run web:lint
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm run web:build
npm run verify:local
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the audit gate and final cleanup**

```powershell
git add apps/web/scripts/check-girumo-brand.mjs apps/web/package.json infra/scripts/verify-online.ps1
git add -u -- apps/web/public/brand/symbol-iris-gradient.svg apps/web/public/brand/lockup-horizontal-dark.png apps/web/public/brand/lockup-horizontal-light.png
git commit -m "chore: enforce Girumo public brand gate"
```

Stage each residual source file fixed in Step 2 by its exact path after reviewing `git diff -- <path>`. Do not stage `apps/web/src`, `apps/web`, or another broad directory because the worktree can contain unrelated user changes.

---

### Task 13: Perform Visual, Accessibility, and Preview Verification

**Files:**
- Update only defects discovered by verification
- Create: `apps/web/scripts/prepare-girumo-qa-state.ts`
- Create: `apps/web/scripts/render-girumo-email-fixtures.ts`
- Modify: `apps/web/package.json`
- Record results: `docs/brand/girumo/qa-readout.md`
- Regenerate after QA: `docs/brand/girumo/Girumo-Brand-Guide.html`
- Regenerate after QA: `apps/web/public/brand/girumo/girumo-brand-guide.pdf`

**Interfaces:**
- Consumes: completed Girumo implementation and preview deployment.
- Produces: evidence-backed release decision.

- [ ] **Step 1: Implement deterministic QA harnesses**

Add package scripts:

```json
"qa:prepare-brand": "tsx scripts/prepare-girumo-qa-state.ts",
"qa:render-brand-emails": "tsx scripts/render-girumo-email-fixtures.ts"
```

`prepare-girumo-qa-state.ts` must use the Supabase service-role client, refuse to run unless `GIRUMO_QA_ALLOW_WRITE` equals `CREATE_GIRUMO_QA_FIXTURES`, require `GIRUMO_QA_DB_HOST_CONFIRM` to exactly equal the hostname parsed from `SUPABASE_URL`, and refuse when `SUPABASE_URL` equals `PRODUCTION_SUPABASE_URL`. It must never print credentials or the service key. Idempotently create or update:

- ordinary and admin Auth users from `GIRUMO_QA_USER_EMAIL/PASSWORD` and `GIRUMO_QA_ADMIN_EMAIL/PASSWORD`;
- organization `girumo-qa`, matching `users` rows, and owner/admin memberships;
- one published `landing_pages` row with slug `girumo-qa-wholesale`, the existing `catalogo-grupo` template, a safe non-live target URL, and wholesale content using `${GIRUMO_DEPLOYMENT_URL}/lp/still-atacado.webp` as its real-operation photo.

The script emits one final JSON line with tenant ID, both user IDs, and `pageSlug`, but no passwords. `render-girumo-email-fixtures.ts` imports `welcomeEmail` and `trialEndingEmail`, renders fixed Girumo QA data into `welcome.html` and `trial-ending.html` under a newly created OS temp directory, and emits that directory as one final JSON line.

- [ ] **Step 2: Create the preview and prepare the QA state**

Load the `vercel:deployments-cicd` skill, configure the QA admin e-mail in `PLATFORM_ADMIN_EMAILS` for the preview environment, and create a preview deployment from the completed implementation branch. Record its HTTPS URL as `GIRUMO_DEPLOYMENT_URL` and the matching engine URL as `ENGINE_DEPLOYMENT_URL`. Run the guarded database harness only against the confirmed non-production Supabase host, then log in through the normal UI once as the ordinary user and once as the admin to establish browser sessions. Render the two e-mail fixtures locally; do not send live messages.

Run this preflight and stop on a missing value:

```powershell
foreach ($name in @("GIRUMO_DEPLOYMENT_URL", "ENGINE_DEPLOYMENT_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PRODUCTION_SUPABASE_URL", "GIRUMO_QA_DB_HOST_CONFIRM", "GIRUMO_QA_USER_EMAIL", "GIRUMO_QA_USER_PASSWORD", "GIRUMO_QA_ADMIN_EMAIL", "GIRUMO_QA_ADMIN_PASSWORD")) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Variável de QA ausente: $name" }
}
$env:GIRUMO_QA_ALLOW_WRITE = "CREATE_GIRUMO_QA_FIXTURES"
$qaState = (npm --workspace apps/web run --silent qa:prepare-brand | Select-Object -Last 1 | ConvertFrom-Json)
$env:GIRUMO_QA_PAGE_SLUG = $qaState.pageSlug
$emailArtifacts = (npm --workspace apps/web run --silent qa:render-brand-emails | Select-Object -Last 1 | ConvertFrom-Json)
$customerPage = "/p/$($env:GIRUMO_QA_PAGE_SLUG)"
```

- [ ] **Step 3: Start the app and verify public routes**

Verify at desktop and 390 px width:

```text
/
/lp
/lp2
/login
/signup
/forgot-password
/reset-password
/posts
$customerPage
```

Check logo clear space, 16 px favicon, Acid CTA contrast, focus rings, line wrapping, and absence of horizontal overflow.

- [ ] **Step 4: Verify authenticated shells**

Verify:

```text
/painel
/painel/campanhas
/painel/grupos
/painel/pages
/painel/configuracoes
/admin
/admin/tenants
/admin/configuracoes
```

Check desktop sidebar, mobile topbar/bottom navigation/drawer, admin drawer, focus states, empty states, notification states, and all persistent logos.

- [ ] **Step 5: Verify generated and external surfaces**

Check:

- `/manifest.webmanifest`;
- `/icon.svg`, `/favicon.ico`, `/apple-icon.png`;
- default Open Graph image;
- square, portrait, story, video-cover, proof, and metric social templates;
- one welcome email and one trial-ending email in a browser preview;
- Instagram avatar in circular crop;
- brand guide PDF;
- proposal DOCX/PDF, sales-deck PPTX, product one-page PDF, email signature, digital card, onboarding cover, and five-page onboarding guide PDF.

- [ ] **Step 6: Run accessibility checks**

Confirm:

- keyboard focus is always visible;
- normal text meets WCAG AA;
- raw Cobalt `#2E66FF` is not normal text on Canvas;
- Acid buttons always use Volt text;
- reduced-motion disables decorative motion;
- logo SVGs have correct `aria-hidden`, `role`, and title behavior.

- [ ] **Step 7: Execute preview smoke tests**

```powershell
if ([string]::IsNullOrWhiteSpace($env:GIRUMO_DEPLOYMENT_URL)) { throw "Defina GIRUMO_DEPLOYMENT_URL com a URL HTTPS criada pelo deploy de preview." }
if ([string]::IsNullOrWhiteSpace($env:ENGINE_DEPLOYMENT_URL)) { throw "Defina ENGINE_DEPLOYMENT_URL com a URL HTTPS do engine usado pelo ambiente de preview." }
npm run verify:online -- -AppUrl $env:GIRUMO_DEPLOYMENT_URL -EngineUrl $env:ENGINE_DEPLOYMENT_URL
```

Expected: landing contains Girumo, auth pages return 200, health check still reports `hubflow-web`.

- [ ] **Step 8: Write the QA readout**

Record tested URLs, viewport sizes, command results, screenshots, defects fixed, intentionally preserved technical HubFlow identifiers, and release recommendation in `docs/brand/girumo/qa-readout.md`.

- [ ] **Step 9: Regenerate the final brand guide from shipped sources**

Compare `docs/brand/girumo/design-tokens.css` with the final production tokens, update the HTML guide for every QA correction, regenerate the PDF with the `pdf:pdf` skill, and re-inspect it. Confirm the guide's filenames, colors, optical logo measurements, type scale, social formats, and commercial examples match the assets actually shipped.

- [ ] **Step 10: Commit verification fixes and evidence**

```powershell
git add apps/web/scripts/prepare-girumo-qa-state.ts apps/web/scripts/render-girumo-email-fixtures.ts apps/web/package.json docs/brand/girumo/qa-readout.md docs/brand/girumo/Girumo-Brand-Guide.html apps/web/public/brand/girumo/girumo-brand-guide.pdf
git commit -m "test: verify Girumo rebrand surfaces"
```

If QA required source fixes, stage each reviewed defect file by exact path before this commit. Never stage the whole `apps/web` directory.

---

## Completion Gate

The rebrand is complete only when:

- `npm --workspace apps/web run brand:export`, `npm --workspace apps/web run brand:check`, web tests, lint, typecheck, build, and `verify:local` all pass;
- public and authenticated surfaces show Girumo;
- generated SVG wordmarks contain paths, not `<text>`;
- favicon, Apple icon, manifest icons, avatar, OG, and PDF are visually verified;
- all required social formats and commercial starter-kit applications are exportable and visually verified;
- the old public name is absent from scoped public surfaces;
- old hosts and internal service/package/database identifiers continue working;
- the QA readout documents intentionally preserved technical HubFlow identifiers;
- legal/domain clearance remains an explicit prerequisite to public domain cutover.
