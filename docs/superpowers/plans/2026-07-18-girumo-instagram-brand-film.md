# Girumo Instagram Brand Film Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produzir um filme de marca Girumo de 24 segundos para o feed do Instagram, em 1080 × 1350 px e 30 fps, usando a voz real do fundador, capturas verdadeiras do produto, versão sem locução, capa e legendas, com exportação determinística e controles que impeçam a publicação de uma demonstração enganosa.

**Architecture:** Criar um workspace Remotion isolado em `apps/video`. A timeline, a copy, os takes, os tokens de marca e o contrato das capturas serão dados tipados e testados. O mesmo componente renderizará as variantes narrada e sem locução. Uma composição interna aceitará quadros técnicos de bloqueio para desenvolver motion antes das funções do produto estarem prontas; as composições públicas rejeitarão qualquer captura não verificada.

**Tech Stack:** Node.js `>=22 <25`, npm workspaces, React `19.2.4`, Remotion `4.0.489`, `@remotion/media`, TypeScript `5.9.3`, `tsx`, Playwright `1.61.1`, FFmpeg local via `ffmpeg-static 5.3.0`, Sharp `0.34.5` e Mediabunny `1.50.8`.

## Global Constraints

- A especificação canônica é `docs/superpowers/specs/2026-07-18-girumo-instagram-brand-film-design.md`.
- A identidade canônica vem de `apps/web/src/lib/brand.ts`, `apps/web/src/lib/girumo-symbol.ts`, `apps/web/public/brand/girumo/` e `docs/brand/girumo/fonts/`.
- O master terá exatamente 720 frames: 24 segundos a 30 fps, sem aceleração perceptível de voz.
- Os takes finais são `Gravando (50).m4a`, `Gravando (46).m4a`, `Gravando (54).m4a` sem o “e” inicial e `Gravando (55).m4a`.
- Os áudios do fundador permanecem locais, não são enviados a APIs e não entram no Git.
- Não usar imagem ou vídeo gerado por IA, mockup genérico de celular, UI inventada, gradiente, glow, vidro, 3D, roxo legado ou wordmark recomposto como texto.
- Não usar `apps/web/public/lp3/grp-1.webp`, `grp-2.webp` ou equivalentes, pois contêm telefones pessoais. Não usar `team-a.webp`, `team-b.webp` ou `team-c.webp` sem autorização específica.
- Todo material de catálogo precisa ser real e autorizado. Qualquer número demonstrativo visível exige o selo `DADOS DEMONSTRATIVOS` em pelo menos 28 px.
- Não mostrar a biblioteca de copys neste filme.
- Não usar “disparo em massa”, “drop” ou “site pronto”.
- A implementação das funções de produto ausentes — rotação Supabase, auto-grow completo, execução recorrente e atribuição ponta a ponta — é um projeto separado. Este plano não altera a lógica dessas funções.
- A exportação pública permanece bloqueada até as funções exibidas serem reais, capturáveis e verificadas.
- A licença Remotion deve ser classificada explicitamente conforme [a licença oficial](https://www.remotion.dev/license). Nenhum script de render público aceita status implícito.
- Quando a classificação for `company-licensed`, `REMOTION_LICENSE_KEY` é obrigatório, é passado ao renderer e nunca é gravado em log ou arquivo versionado.
- O workspace já contém alterações do usuário. Cada commit deve adicionar somente os caminhos listados na própria tarefa; nunca executar `git add .`.
- `apps/video/dist`, capturas, estado de autenticação e áudio bruto são artefatos locais ignorados pelo Git.

## Delivery Contract

| Entrega | Caminho local final |
|---|---|
| Master narrado | `apps/video/dist/master/girumo-brand-film-voice-1080x1350.mp4` |
| Master sem locução | `apps/video/dist/master/girumo-brand-film-sound-off-1080x1350.mp4` |
| Publicação narrada | `apps/video/dist/publish/girumo-brand-film-voice-1080x1350.mp4` |
| Publicação sem locução | `apps/video/dist/publish/girumo-brand-film-sound-off-1080x1350.mp4` |
| Capa | `apps/video/dist/publish/girumo-brand-film-cover-1080x1350.png` |
| Legendas | `apps/video/dist/publish/girumo-brand-film-pt-BR.srt` |
| Prévia interna narrada | `apps/video/dist/review/girumo-brand-film-internal-voice-preview.mp4` |
| Prévia interna sem locução | `apps/video/dist/review/girumo-brand-film-internal-sound-off-preview.mp4` |
| Folha de revisão | `apps/video/dist/review/girumo-brand-film-contact-sheet.png` |

---

## Task 1: Scaffold the isolated video workspace and lock the 24-second contract

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `apps/video/package.json`
- Create: `apps/video/tsconfig.json`
- Create: `apps/video/remotion.config.ts`
- Create: `apps/video/src/contract.test.ts`
- Create: `apps/video/src/contract.ts`
- Create: `apps/video/src/index.ts`
- Create: `apps/video/src/Root.tsx`

- [ ] **Step 1: Write the failing contract test**

Create `apps/video/src/contract.test.ts`:

```ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {
  FILM_DURATION_IN_FRAMES,
  FILM_FPS,
  FILM_HEIGHT,
  FILM_WIDTH,
  PROHIBITED_COPY,
  SCENES,
  SOUND_OFF_COPY,
  VOICE_COPY,
} from "./contract";

test("locks the Instagram master to 24 seconds at 30 fps", () => {
  assert.equal(FILM_FPS, 30);
  assert.equal(FILM_DURATION_IN_FRAMES, 720);
  assert.equal(FILM_WIDTH, 1080);
  assert.equal(FILM_HEIGHT, 1350);
});

test("keeps every scene contiguous", () => {
  assert.equal(SCENES[0].from, 0);
  for (let index = 1; index < SCENES.length; index += 1) {
    const previous = SCENES[index - 1];
    assert.equal(SCENES[index].from, previous.from + previous.durationInFrames);
  }
  const last = SCENES.at(-1);
  assert.ok(last);
  assert.equal(last.from + last.durationInFrames, FILM_DURATION_IN_FRAMES);
});

test("contains only the approved four spoken lines", () => {
  assert.deepEqual(Object.values(VOICE_COPY), [
    "A venda nos grupos começa antes mesmo da primeira oferta.",
    "Antes de lotar, o próximo grupo é criado automaticamente.",
    "Você sabe exatamente de onde veio cada venda.",
    "Girumo. Mais grupos lotados. Menos trabalho. Mais vendas.",
  ]);
});

test("keeps both variants free of prohibited market language", () => {
  const corpus = [...Object.values(VOICE_COPY), ...Object.values(SOUND_OFF_COPY)]
    .join(" ")
    .toLocaleLowerCase("pt-BR");
  for (const term of PROHIBITED_COPY) assert.equal(corpus.includes(term), false);
});
```

- [ ] **Step 2: Run the test and confirm the expected failure**

Run:

```powershell
npx.cmd tsx --test "apps/video/src/contract.test.ts"
```

Expected: `ERR_MODULE_NOT_FOUND` for `./contract`.

- [ ] **Step 3: Create the workspace package with exact versions**

Create `apps/video/package.json`:

```json
{
  "name": "@girumo/video",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22 <25"
  },
  "scripts": {
    "assets:sync": "tsx scripts/sync-brand-assets.ts",
    "audio:import": "tsx scripts/import-founder-audio.ts",
    "audio:process": "tsx scripts/process-founder-audio.ts",
    "audio:generate-bed": "tsx scripts/generate-sound-bed.ts",
    "captions:build": "tsx scripts/build-subtitles.ts",
    "capture": "tsx scripts/capture-product-scenes.ts",
    "capture:verify": "tsx scripts/verify-captures.ts",
    "test": "tsx --test \"src/**/*.test.ts\" \"scripts/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "check": "npm run test && npm run typecheck",
    "studio": "npm run assets:sync && remotion studio src/index.ts",
    "render:review": "tsx scripts/render-review.ts",
    "render": "tsx scripts/render-deliverables.ts",
    "verify:deliverables": "tsx scripts/verify-deliverables.ts",
    "release:check": "tsx scripts/release-check.ts"
  },
  "dependencies": {
    "@remotion/media": "4.0.489",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "remotion": "4.0.489"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@remotion/bundler": "4.0.489",
    "@remotion/cli": "4.0.489",
    "@remotion/renderer": "4.0.489",
    "@types/node": "22.18.0",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "dotenv": "17.4.2",
    "ffmpeg-static": "5.3.0",
    "mediabunny": "1.50.8",
    "sharp": "0.34.5",
    "tsx": "4.22.4",
    "typescript": "5.9.3"
  }
}
```

All `remotion` and `@remotion/*` packages must remain on the same exact version, as required by the [official CLI package](https://www.npmjs.com/package/@remotion/cli).

- [ ] **Step 4: Add the workspace and root commands**

In root `package.json`, add `"apps/video"` between `apps/web` and `hubflow-engine`, then add:

```json
"video:studio": "npm --workspace apps/video run studio",
"video:test": "npm --workspace apps/video run test",
"video:check": "npm --workspace apps/video run check",
"video:review": "npm --workspace apps/video run render:review",
"video:render": "npm --workspace apps/video run render",
"video:verify": "npm --workspace apps/video run verify:deliverables"
```

- [ ] **Step 5: Add local-media exclusions**

Append to `.gitignore`:

```gitignore
apps/video/.auth/
apps/video/.env.local
apps/video/private/
apps/video/public/audio/
apps/video/public/brand/
apps/video/public/captures/
apps/video/public/fonts/
apps/video/dist/
```

- [ ] **Step 6: Add TypeScript and Remotion configuration**

Create `apps/video/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts", "remotion.config.ts"]
}
```

Create `apps/video/remotion.config.ts`:

```ts
import {Config} from "@remotion/cli/config";

Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setVideoImageFormat("png");
```

- [ ] **Step 7: Implement the exact timeline and copy contract**

Create `apps/video/src/contract.ts`:

```ts
export const FILM_FPS = 30;
export const FILM_WIDTH = 1080;
export const FILM_HEIGHT = 1350;
export const FILM_DURATION_IN_FRAMES = 720;
export const SAFE_X = 90;
export const SAFE_Y = 120;
export const DESLOCAMENTO_ENTRY_FRAMES = [0, 270, 567] as const;

export const SCENES = [
  {id: "hook", from: 0, durationInFrames: 120},
  {id: "capture", from: 120, durationInFrames: 105},
  {id: "auto-grow", from: 225, durationInFrames: 117},
  {id: "publishing", from: 342, durationInFrames: 117},
  {id: "attribution", from: 459, durationInFrames: 108},
  {id: "end-card", from: 567, durationInFrames: 153},
] as const;

export type SceneId = (typeof SCENES)[number]["id"];
export type FilmVariant = "voice" | "sound-off";
export type FilmMode = "internal" | "public";

export const VOICE_COPY = {
  hook: "A venda nos grupos começa antes mesmo da primeira oferta.",
  "auto-grow": "Antes de lotar, o próximo grupo é criado automaticamente.",
  attribution: "Você sabe exatamente de onde veio cada venda.",
  "end-card": "Girumo. Mais grupos lotados. Menos trabalho. Mais vendas.",
} as const;

export const SOUND_OFF_COPY = {
  hook: VOICE_COPY.hook,
  capture: "Páginas prontas liberam o acesso ao grupo com vaga.",
  "auto-grow": VOICE_COPY["auto-grow"],
  publishing: "Prepare uma vez. Publique em todos os grupos, todos os dias.",
  attribution: VOICE_COPY.attribution,
  "end-card": "Mais grupos lotados. Menos trabalho. Mais vendas.",
} as const;

export const OPERATIONAL_LABELS = {
  capture: "PÁGINA PRONTA → ACESSO AO GRUPO COM VAGA",
  "auto-grow": "GRUPO 07 · 90% → GRUPO 08 · CRIADO",
  publishing: "PREPARE UMA VEZ · TODOS OS GRUPOS · TODOS OS DIAS",
  attribution: "VENDA CONFIRMADA · ORIGEM IDENTIFICADA",
} as const;

export const PROHIBITED_COPY = ["disparo em massa", "drop", "site pronto"] as const;
```

- [ ] **Step 8: Register a minimal Remotion root entry**

Create `apps/video/src/index.ts`:

```ts
import {registerRoot} from "remotion";
import {RemotionRoot} from "./Root";

registerRoot(RemotionRoot);
```

Create `apps/video/src/Root.tsx`:

```tsx
export const RemotionRoot = () => null;
```

- [ ] **Step 9: Install and run the contract test**

Run:

```powershell
npm.cmd install
npm.cmd --workspace apps/video run test
```

Expected: four passing tests in `contract.test.ts`.

- [ ] **Step 10: Commit only the scaffold**

```powershell
git add package.json package-lock.json .gitignore apps/video/package.json apps/video/tsconfig.json apps/video/remotion.config.ts apps/video/src/contract.ts apps/video/src/contract.test.ts apps/video/src/index.ts apps/video/src/Root.tsx
git commit -m "feat(video): scaffold Girumo film renderer"
```

---

## Task 2: Consume the official Girumo identity without duplicating the brand

**Files:**

- Create: `apps/video/scripts/sync-brand-assets.test.ts`
- Create: `apps/video/scripts/sync-brand-assets.ts`
- Create: `apps/video/src/brand.ts`
- Create: `apps/video/src/styles.css`
- Create: `apps/video/src/components/BrandCanvas.tsx`
- Create: `apps/video/src/components/BrandLockup.tsx`
- Create: `apps/video/src/components/Deslocamento.tsx`
- Create: `apps/video/src/components/brand-policy.test.ts`

- [ ] **Step 1: Write the failing asset-sync test**

The test must create a temporary directory, call `syncBrandAssets(tempRoot)`, then compare SHA-256 hashes between each generated file and its canonical source. It must cover:

```ts
export const BRAND_ASSET_MAP = {
  "brand/girumo-lockup-horizontal-paper.svg":
    "apps/web/public/brand/girumo/svg/girumo-lockup-horizontal-paper.svg",
  "fonts/manrope-latin-variable.woff2":
    "docs/brand/girumo/fonts/manrope-latin-variable.woff2",
  "fonts/ibm-plex-sans-latin.woff2":
    "docs/brand/girumo/fonts/ibm-plex-sans-latin.woff2",
  "fonts/ibm-plex-mono-latin.woff2":
    "docs/brand/girumo/fonts/ibm-plex-mono-latin.woff2",
  "fonts/ibm-plex-mono-medium.woff2":
    "docs/brand/girumo/fonts/ibm-plex-mono-medium.woff2",
} as const;
```

- [ ] **Step 2: Run the test and confirm failure**

```powershell
npm.cmd --workspace apps/video run test -- scripts/sync-brand-assets.test.ts
```

Expected: module `sync-brand-assets` is missing.

- [ ] **Step 3: Implement deterministic asset synchronization**

In `sync-brand-assets.ts`:

1. Resolve the repository root from `import.meta.url`.
2. Copy every `BRAND_ASSET_MAP` entry into `apps/video/public` or the test destination.
3. Compute a SHA-256 hash before and after copying.
4. Throw when hashes differ.
5. Write `apps/video/public/brand/sync-report.json` with source, destination and hash.
6. Export `syncBrandAssets(destinationRoot)` for tests.
7. Execute it only when `import.meta.url === pathToFileURL(process.argv[1]).href`.

- [ ] **Step 4: Import canonical tokens and symbol paths**

Create `apps/video/src/brand.ts`:

```ts
export {BRAND, BRAND_COLORS} from "../../web/src/lib/brand";
export {GIRUMO_PATHS, GIRUMO_VIEWBOX} from "../../web/src/lib/girumo-symbol";

export const TYPE = {
  display: "Manrope, sans-serif",
  body: "IBM Plex Sans, sans-serif",
  operational: "IBM Plex Mono, monospace",
} as const;

export const MOTION = {
  microFrames: 6,
  transitionFrames: 8,
  easing: [0.22, 1, 0.36, 1] as const,
} as const;
```

- [ ] **Step 5: Load only local fonts**

Create `apps/video/src/styles.css` with four `@font-face` blocks pointing to `/fonts/*.woff2`, matching weights from `docs/brand/girumo/fonts/fonts.css`. Add:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #071923;
}
```

Do not add network font imports.

- [ ] **Step 6: Build the brand primitives**

- `BrandCanvas.tsx`: `AbsoluteFill`, Volt background, safe-area CSS variables `--safe-x: 90px` and `--safe-y: 120px`.
- `BrandLockup.tsx`: use `Img` plus `staticFile("brand/girumo-lockup-horizontal-paper.svg")`; never write “Girumo” with a live font as the logo.
- `Deslocamento.tsx`: render exactly the two `GIRUMO_PATHS` inside viewBox `0 0 24 24`; animate only `translateX` of each mass, with no rotation, morph or path interpolation.

Use this pure motion helper:

```ts
import {Easing, interpolate} from "remotion";
import {MOTION} from "../brand";

export const passageProgress = (frame: number, start: number) =>
  interpolate(frame, [start, start + MOTION.transitionFrames], [0, 1], {
    easing: Easing.bezier(...MOTION.easing),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
```

- [ ] **Step 7: Add the brand-policy regression test**

`brand-policy.test.ts` must:

- assert `BRAND_COLORS.volt === "#071923"`, `acid === "#A7FF2F"`, `paper === "#FFFEFA"` and `canvas === "#F4F0E7"`;
- assert `BRAND.tagline === "Mais grupos lotados. Menos trabalho. Mais vendas."`;
- scan production files under `apps/video/src`, excluding every `*.test.ts` and `*.test.tsx`, and reject `linear-gradient`, `radial-gradient`, `conic-gradient`, `filter: blur`, `text-shadow` and the legacy purple values `#7c3aed`, `#8b5cf6`, `#a855f7` case-insensitively;
- assert the planned Deslocamento entry frames equal `[0, 270, 567]` and total no more than three.

- [ ] **Step 8: Run tests and typecheck the brand layer**

```powershell
npm.cmd --workspace apps/video run assets:sync
npm.cmd --workspace apps/video run test
npm.cmd --workspace apps/video run typecheck
```

Expected: all brand tests and TypeScript pass.

- [ ] **Step 9: Commit only canonical brand consumption**

```powershell
git add apps/video/scripts/sync-brand-assets.ts apps/video/scripts/sync-brand-assets.test.ts apps/video/src/brand.ts apps/video/src/styles.css apps/video/src/components/BrandCanvas.tsx apps/video/src/components/BrandLockup.tsx apps/video/src/components/Deslocamento.tsx apps/video/src/components/brand-policy.test.ts
git commit -m "feat(video): add official Girumo brand primitives"
```

---

## Task 3: Create a truthful capture contract and a hard public-render gate

**Files:**

- Create: `apps/video/production/capture-manifest.json`
- Create: `apps/video/src/captures.ts`
- Create: `apps/video/src/captures.test.ts`
- Create: `apps/video/src/capture-scenarios.ts`
- Create: `apps/video/src/capture-scenarios.test.ts`
- Create: `apps/video/src/components/TechnicalHoldFrame.tsx`
- Create: `apps/video/scripts/capture-product-scenes.ts`
- Create: `apps/video/scripts/verify-captures.ts`
- Create: `apps/video/.env.example`
- Modify: `apps/web/src/components/pages/templates/basic.tsx`
- Modify: `apps/web/src/components/pages/lead-form.tsx`
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx`
- Modify: `apps/web/src/components/painel/messages/schedule-composer.tsx`
- Modify: `apps/web/src/app/painel/resultados/page.tsx`

- [ ] **Step 1: Write the failing gate tests**

Test three cases:

1. internal mode accepts `capture-ready` and `blocked-product`;
2. public mode rejects every shot not marked `verified`;
3. public mode rejects a `verified` shot when its PNG hash differs from the manifest.

Expected public error format:

```text
Public render blocked: page-idle, lead-success, groups-before, groups-after, campaign-scheduled, campaign-published, attribution-before, attribution
```

- [ ] **Step 2: Define the initial production manifest**

Create `production/capture-manifest.json` with these shot IDs and initial states:

| ID | Initial state | Real route/surface | Required proof |
|---|---|---|---|
| `page-idle` | `capture-ready` | `/p/[slug]` | published Girumo page with authorized clothing catalog |
| `lead-success` | `blocked-product` | lead form success | contact persisted and redirected to the invitation of the same real group with vacancy used by capacity management; this proves access handoff, not WhatsApp membership |
| `groups-before` | `blocked-product` | campaign Groups tab | current group at 90% from the active Supabase data path |
| `groups-after` | `blocked-product` | campaign Groups tab | next group created by the actual auto-grow execution |
| `campaign-scheduled` | `blocked-product` | campaign Messages tab | persisted daily recurrence for the real campaign message |
| `campaign-published` | `blocked-product` | campaign Agenda | execution audit proving publication across selected groups |
| `attribution-before` | `blocked-product` | `/painel/resultados` | the demonstrative transaction ID is absent before the real sale event |
| `attribution` | `blocked-product` | `/painel/resultados` | the same transaction ID shows sale → contact → campaign → page → group in the real UI after execution |

Define the four executable scenarios in `capture-scenarios.ts`; do not store prose instructions in JSON:

```ts
export type CapturePrepareHandler =
  | "prepareLeadHandoff"
  | "prepareAutoGrowThreshold"
  | "prepareRecurringPublication"
  | "prepareSaleAttribution";

export type CaptureTriggerHandler =
  | "submitLeadForm"
  | "submitCapacityThresholdLead"
  | "awaitScheduledPublication"
  | "recordSaleThroughProductFlow";

export const CAPTURE_SCENARIOS = {
  "lead-handoff": {
    beforeShotId: "page-idle",
    afterShotId: "lead-success",
    prepareHandler: "prepareLeadHandoff",
    prepareAssertions: [
      {selector: '[data-video-capture="lead-page"]', state: "visible"},
      {selector: '[data-video-group-availability="available"]', state: "visible"},
    ],
    beforeCapturePhase: "before-trigger",
    before: [{selector: '[data-video-capture="lead-page"]', state: "visible"}],
    triggerHandler: "submitLeadForm",
    result: [
      {selector: '[data-video-capture="lead-form"][data-video-state="success"]', state: "visible"},
      {selector: '[data-video-invite-access="ready"]', state: "visible"},
    ],
    evidenceSelector: '[data-video-execution-id]',
  },
  "auto-grow": {
    beforeShotId: "groups-before",
    afterShotId: "groups-after",
    prepareHandler: "prepareAutoGrowThreshold",
    prepareAssertions: [
      {selector: '[data-video-group-slot="current"][data-video-capacity="89"]', state: "visible"},
      {selector: '[data-video-group-slot="next"]', state: "absent"},
    ],
    beforeCapturePhase: "after-trigger",
    before: [
      {selector: '[data-video-group-slot="current"][data-video-capacity="90"]', state: "visible"},
      {selector: '[data-video-group-slot="next"]', state: "absent"},
    ],
    triggerHandler: "submitCapacityThresholdLead",
    result: [
      {selector: '[data-video-group-slot="next"][data-video-created-by="auto-grow"]', state: "visible"},
    ],
    evidenceSelector: '[data-video-execution-id]',
  },
  "recurring-publication": {
    beforeShotId: "campaign-scheduled",
    afterShotId: "campaign-published",
    prepareHandler: "prepareRecurringPublication",
    prepareAssertions: [
      {selector: '[data-video-message-state="scheduled"][data-video-recurrence="daily"]', state: "visible"},
    ],
    beforeCapturePhase: "before-trigger",
    before: [
      {selector: '[data-video-message-state="scheduled"][data-video-recurrence="daily"]', state: "visible"},
    ],
    triggerHandler: "awaitScheduledPublication",
    result: [
      {selector: '[data-video-publication-state="completed"]', state: "visible"},
    ],
    evidenceSelector: '[data-video-execution-id]',
  },
  "sale-attribution": {
    beforeShotId: "attribution-before",
    afterShotId: "attribution",
    prepareHandler: "prepareSaleAttribution",
    prepareAssertions: [
      {selectorTemplate: '[data-video-transaction-id="{transactionId}"]', state: "absent"},
    ],
    beforeCapturePhase: "before-trigger",
    before: [
      {selectorTemplate: '[data-video-transaction-id="{transactionId}"]', state: "absent"},
    ],
    triggerHandler: "recordSaleThroughProductFlow",
    result: [
      {selectorTemplate: '[data-video-transaction-id="{transactionId}"][data-video-attribution="complete"]', state: "visible"},
    ],
    evidenceSelectorTemplate: '[data-video-transaction-id="{transactionId}"]',
  },
} as const;
```

`capture-scenarios.test.ts` must validate all selector templates before interpolation, require exactly one exhaustive handler per prepare and trigger union member, validate the two allowed capture phases and reject a scenario without a before/after pair, preparation assertion, before-state assertion, result assertion or evidence selector.

Each shot object must contain:

```json
{
  "id": "page-idle",
  "file": "page-idle.png",
  "status": "capture-ready",
  "routeKey": "public-page",
  "landmark": "lead-page",
  "scenarioId": "lead-handoff",
  "phase": "before",
  "executionId": null,
  "sha256": null,
  "capturedAt": null,
  "productCommit": null,
  "privacyReview": "not-reviewed",
  "catalogAuthorization": "required"
}
```

- [ ] **Step 3: Implement the gate as a pure function**

`captures.ts` must export:

```ts
export type CaptureStatus = "capture-ready" | "blocked-product" | "captured" | "verified";
export type CaptureMode = "internal" | "public";

export function assertCaptureGate(
  manifest: CaptureManifest,
  mode: CaptureMode,
  actualHashes: Readonly<Record<string, string>>,
): void;
```

For public mode, require for every shot:

- `status === "verified"`;
- non-null `sha256`, `capturedAt` and `productCommit`;
- `privacyReview === "approved"`;
- `catalogAuthorization === "approved"`;
- exact SHA-256 match;
- a non-empty `scenarioId`, valid `phase` and execution ID matching its paired before/after shot.

- [ ] **Step 4: Add the internal technical hold frame**

`TechnicalHoldFrame.tsx` must render only in internal mode:

```text
PRÉVIA INTERNA
CAPTURA REAL BLOQUEADA
<shot id>
NÃO PUBLICAR
```

Use Volt, Paper and one Acid rule. Do not draw simulated UI. The component must throw if rendered with `mode="public"`.

The `page-idle` shot is the only capture allowed before all product capabilities are complete. It must still come from the real published page, pass automated privacy checks and be manually reviewed before the first internal preview; it may never be replaced by invented UI.

- [ ] **Step 5: Add capture landmarks without changing product behavior**

Add only stable attributes:

- `data-video-capture="lead-page"` on the real public page shell;
- `data-video-capture="lead-form"` and `data-video-state={state}` on the real lead form;
- `data-video-group-availability`, `data-video-action="lead-submit"`, `data-video-invite-access` and `data-video-execution-id` on the lead flow only when backed by persisted runtime values;
- `data-video-capture="campaign-groups"` on the real Groups tab content;
- `data-video-group-slot`, `data-video-capacity`, `data-video-created-by` and the real worker execution ID on group rows;
- `data-video-capture="campaign-schedule"` on the real schedule composer;
- `data-video-message-state`, `data-video-recurrence`, `data-video-publication-state` and the real publication execution ID on schedule/Agenda rows;
- `data-video-capture="results-attribution"` on the real results surface;
- `data-video-transaction-id` and `data-video-attribution="complete"` on a result row only when all attribution joins exist.

These attributes may expose opaque IDs only inside the ignored local capture account; the privacy scan must crop or redact them from the rendered frame. If a backing runtime value does not exist yet, do not fabricate the attribute and leave its scenario `blocked-product`. Do not add query-string demo modes, alternate stores, hard-coded group data or hidden film-only result rows.

- [ ] **Step 6: Define local capture environment variables**

Create `.env.example`:

```dotenv
GIRUMO_VIDEO_BASE_URL=http://localhost:3000
GIRUMO_VIDEO_PAGE_SLUG=
GIRUMO_VIDEO_CAMPAIGN_SLUG=
GIRUMO_VIDEO_AUTH_STATE=apps/video/.auth/storage-state.json
GIRUMO_VIDEO_CAPTURE_REVISION=girumo-film-2026-07-18
GIRUMO_AUDIO_SOURCE_DIR=
REMOTION_LICENSE_STATUS=unreviewed
REMOTION_LICENSE_KEY=
GIRUMO_LEGAL_NAME_STATUS=unreviewed
```

No password, token, group invite or phone number may appear in this file.

- [ ] **Step 7: Implement the Playwright capture script**

The script must execute each scenario as one reproducible transaction:

1. Resolve the app root with `fileURLToPath(new URL("..", import.meta.url))`, then load `apps/video/.env.local` with `config({path: join(appRoot, ".env.local")})` from `dotenv`.
2. Launch Chromium headless with a 1440 × 1800 viewport and device scale factor 2.
3. Reuse the ignored `storage-state.json` for authenticated routes.
4. Visit only scenarios whose paired shots are `capture-ready` or `captured`.
5. Dispatch preparation and trigger through exhaustive switches over `CapturePrepareHandler` and `CaptureTriggerHandler`; each handler must use accessible UI controls or the same authenticated product endpoint used in normal operation.
6. Run `prepareHandler` and assert every `prepareAssertions` selector.
7. If `beforeCapturePhase === "before-trigger"`, assert `before` and capture the before shot now.
8. Run `triggerHandler`; do not write directly to a film-only store or substitute a seeded post-state.
9. If `beforeCapturePhase === "after-trigger"`, assert `before` and capture the before shot now, before awaiting the asynchronous result. This is how auto-grow proves the real 89% → contact → 90% transition before Group 08 appears.
10. Wait for every typed result assertion and the evidence selector, then require a non-empty execution or transaction ID and capture the paired `after` shot in the same run. `awaitScheduledPublication` does not schedule again; it waits for the already-persisted due message to be processed by the normal worker.
11. Store the same execution ID on both shot records so the verifier can prove they belong to one transaction.
12. Reject visible text matching a Brazilian phone pattern, email address, `HubFlow`, `Mega Stock`, access token or invite URL.
13. Reject computed `backgroundImage` values containing `gradient` inside the capture root.
14. Screenshot only the real landmark into `public/captures/<file>`.
15. Compute each PNG hash and set state to `captured`; never set `verified` automatically.

The only supported partial run is `--before-only page-idle`, used to obtain the truthful opening frame before the remaining product prerequisites exist. It asserts and captures the initial page but cannot satisfy the paired scenario or any public gate.

Install Chromium once on the capture machine:

```powershell
npm.cmd exec --workspace apps/video -- playwright install chromium
```

- [ ] **Step 8: Implement automated capture verification**

`verify-captures.ts` must print a table with status, hash match, privacy review, catalog authorization and product commit. Exit code must be non-zero for public mode when any field fails.

Run:

```powershell
npm.cmd --workspace apps/video run test
npm.cmd --workspace apps/video run capture:verify -- --mode internal
```

Expected now: unit tests pass and internal verification reports product blocks without failing.

- [ ] **Step 9: Commit only the capture contract and landmarks**

```powershell
git add apps/video/production/capture-manifest.json apps/video/src/captures.ts apps/video/src/captures.test.ts apps/video/src/capture-scenarios.ts apps/video/src/capture-scenarios.test.ts apps/video/src/components/TechnicalHoldFrame.tsx apps/video/scripts/capture-product-scenes.ts apps/video/scripts/verify-captures.ts apps/video/.env.example apps/web/src/components/pages/templates/basic.tsx apps/web/src/components/pages/lead-form.tsx "apps/web/src/app/painel/campanhas/[slug]/page.tsx" apps/web/src/components/painel/messages/schedule-composer.tsx apps/web/src/app/painel/resultados/page.tsx
git commit -m "feat(video): gate Girumo film on verified product captures"
```

---

## Task 4: Import, trim and mix the founder voice locally

**Files:**

- Create: `apps/video/src/audio-manifest.ts`
- Create: `apps/video/src/audio-manifest.test.ts`
- Create: `apps/video/src/components/FounderVoiceTrack.tsx`
- Create: `apps/video/src/components/SoundBedTrack.tsx`
- Create: `apps/video/scripts/import-founder-audio.ts`
- Create: `apps/video/scripts/import-founder-audio.test.ts`
- Create: `apps/video/scripts/process-founder-audio.ts`
- Create: `apps/video/scripts/process-founder-audio.test.ts`
- Create: `apps/video/scripts/generate-sound-bed.ts`
- Create: `apps/video/scripts/generate-sound-bed.test.ts`
- Create: `apps/video/scripts/build-subtitles.ts`
- Create: `apps/video/scripts/build-subtitles.test.ts`

- [ ] **Step 1: Write failing tests for take identity, trim and placement**

The audio contract must assert:

```ts
export const VOICE_TAKES = [
  {
    scene: "hook",
    file: "Gravando (50).m4a",
    sha256: "A7D3F3F1EFE3290BA7938A351268750DA6992AFCB2919E280E0F02252BE3661D",
    sequenceFrom: 0,
    sourceStartSample: 35040,
    sourceEndSample: 217440,
    prependSilenceSamples: 0,
    durationInFrames: 114,
    preGainDb: 0,
    fadeInSamples: 240,
    fadeOutSamples: 240,
    gain: 1,
  },
  {
    scene: "auto-grow",
    file: "Gravando (46).m4a",
    sha256: "AA4D3D12A5EDD66BF671FA909C961BF3A9A1BF3F5C17EF9D16629036239F063D",
    sequenceFrom: 225,
    sourceStartSample: 15840,
    sourceEndSample: 203040,
    prependSilenceSamples: 0,
    durationInFrames: 117,
    preGainDb: 0,
    fadeInSamples: 240,
    fadeOutSamples: 240,
    gain: 1,
  },
  {
    scene: "attribution",
    file: "Gravando (54).m4a",
    sha256: "77D11666EA53E2536289F96ACC240B7A2781A2C28D60E5638C4532640014EDB4",
    sequenceFrom: 459,
    sourceStartSample: 46076,
    sourceEndSample: 218396,
    prependSilenceSamples: 480,
    durationInFrames: 108,
    preGainDb: -3,
    fadeInSamples: 240,
    fadeOutSamples: 240,
    gain: 1,
  },
  {
    scene: "end-card",
    file: "Gravando (55).m4a",
    sha256: "9A261B8F206E7BE89C3F40AAC35437D7C90D6E7BC18A6DEF1ABC435B7003F886",
    sequenceFrom: 567,
    sourceStartSample: 14400,
    sourceEndSample: 257600,
    prependSilenceSamples: 0,
    durationInFrames: 152,
    preGainDb: 0,
    fadeInSamples: 240,
    fadeOutSamples: 240,
    gain: 1,
  },
] as const;
```

The test must also confirm that `(sourceEndSample - sourceStartSample + prependSilenceSamples) === durationInFrames × 1,600` for every take, so every processed duration is an exact whole-frame sample count at 48 kHz, fits its scene and requires no playback-rate change.

- [ ] **Step 2: Implement the manifest and local import script**

`import-founder-audio.ts` must:

- require `GIRUMO_AUDIO_SOURCE_DIR`;
- find the four exact basenames;
- compute SHA-256 before copying;
- reject any mismatch with the constants above;
- copy into `apps/video/public/audio/raw/`;
- never delete or modify the source recordings.

Run locally:

```powershell
$env:GIRUMO_AUDIO_SOURCE_DIR="$env:USERPROFILE\Documents\Gravações de som"
npm.cmd --workspace apps/video run audio:import
```

Expected: four files copied and four hash confirmations.

- [ ] **Step 3: Process the voice non-destructively with the local FFmpeg binary**

`process-founder-audio.ts` must use the executable path exported by `ffmpeg-static` and create one already-trimmed WAV per take in `public/audio/processed/`. Decode at 48 kHz, trim by the integer `sourceStartSample` and `sourceEndSample` indices, prepend the contracted silence samples, reset timestamps, apply `volume=${preGainDb}dB` before every other filter, then use this chain:

```text
volume=${preGainDb}dB,highpass=f=75,lowpass=f=14000,afftdn=nf=-48,equalizer=f=180:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1:g=2,deesser=i=0.3:m=0.45:f=0.5,loudnorm=I=-18:LRA=7:TP=-2
```

Apply the 240-sample fades only at the padded clip boundaries after normalization; no Remotion frame fade may overlap a spoken phoneme. For take 54, the 240-sample fade-in lives entirely inside the 480 prepended silent samples. Force each output to exactly `durationInFrames × 1,600` samples, because one 30 fps frame equals 1,600 samples at 48 kHz. Encode as mono PCM 24-bit at 48 kHz. Never overwrite the M4A input. The test must confirm:

- raw SHA-256 is unchanged before and after processing;
- output is WAV, mono, 48 kHz and has the exact contracted sample count;
- take 54 receives −3 dB before the processing chain, begins at audited zero crossing sample 46,076, prepends 480 silent samples and leaves the first spoken sample outside the fade; the listening gate below confirms the spoken result;
- FFmpeg `ebur128` analysis reports integrated loudness within −18 ± 1 LUFS and true peak at or below −1 dBTP;
- a second processing run produces the same output hash on the same operating system.

`ffmpeg-static` is production tooling only; do not copy or ship its GPL-licensed executable with the Girumo deliverables.

- [ ] **Step 4: Render the four trimmed voice entries**

`FounderVoiceTrack.tsx` must use each already-trimmed processed WAV with `Audio` from `@remotion/media` and gain 1. Wrap each entry in a `Sequence` at `sequenceFrom` with the contracted `durationInFrames`. Do not add another trim or fade in Remotion and do not set `playbackRate`.

The take `54` source clip begins at sample 46,076 (0.9599167 seconds at 48 kHz), specifically to remove its initial “e” without softening “Você”.

- [ ] **Step 5: Generate an original deterministic sound bed**

`generate-sound-bed.ts` must create a 24-second, 48 kHz, stereo, PCM WAV using only Node buffers:

- a quiet mid-band pulse based on 110 Hz and 220 Hz;
- no stock loop and no generative API;
- deterministic seeded noise only for short material clicks;
- confirmation accents at global frames `146`, `279`, `375`, `420`, `501` and `567`;
- peak below −12 dBFS before the Remotion mix;
- exact output `public/audio/generated/girumo-sound-bed.wav`.

The test must generate the file twice, compare SHA-256 hashes, then validate WAV header values: 48,000 Hz, two channels and 1,152,000 samples per channel.

- [ ] **Step 6: Add scene-aware ducking**

`SoundBedTrack.tsx` must play the generated WAV for all 720 frames and receive the film variant. In the narrated variant, use volume `0.16` during spoken scenes and `0.28` during capture and publishing. In the sound-off variant, use `0.28` throughout the active story because there is no voice to duck under. Both variants use a six-frame fade to zero at the end. The sound-off variant keeps the sound bed and interface SFX; it removes only `FounderVoiceTrack`.

- [ ] **Step 7: Generate exact SRT captions**

`build-subtitles.ts` must write:

```srt
1
00:00:00,090 --> 00:00:03,650
A venda nos grupos começa antes mesmo
da primeira oferta.

2
00:00:07,540 --> 00:00:11,360
Antes de lotar, o próximo grupo é criado
automaticamente.

3
00:00:15,300 --> 00:00:18,880
Você sabe exatamente de onde veio
cada venda.

4
00:00:18,970 --> 00:00:23,870
Girumo. Mais grupos lotados.
Menos trabalho. Mais vendas.
```

The test must parse cue ordering, reject overlaps and assert the last cue ends before frame 720.

- [ ] **Step 8: Audition and run audio tests**

Listen locally to each processed WAV by itself and to the narrated review mix. Confirm that take 54 starts cleanly on “Você”, no final word is faded, sibilance remains natural and the bed never masks the founder voice. Record the audition result and the processed hashes in `apps/video/dist/review/audio-audition.json`; this file remains local and is required by the review render.

```powershell
npm.cmd --workspace apps/video run audio:generate-bed
npm.cmd --workspace apps/video run audio:process
npm.cmd --workspace apps/video run captions:build
npm.cmd --workspace apps/video run test
```

Expected: deterministic WAV and SRT tests pass; no raw M4A appears in `git status`.

- [ ] **Step 9: Commit only audio code and contracts**

```powershell
git add apps/video/src/audio-manifest.ts apps/video/src/audio-manifest.test.ts apps/video/src/components/FounderVoiceTrack.tsx apps/video/src/components/SoundBedTrack.tsx apps/video/scripts/import-founder-audio.ts apps/video/scripts/import-founder-audio.test.ts apps/video/scripts/process-founder-audio.ts apps/video/scripts/process-founder-audio.test.ts apps/video/scripts/generate-sound-bed.ts apps/video/scripts/generate-sound-bed.test.ts apps/video/scripts/build-subtitles.ts apps/video/scripts/build-subtitles.test.ts
git commit -m "feat(video): add local founder voice and original sound bed"
```

---

## Task 5: Build the high-end editorial primitives

**Files:**

- Create: `apps/video/src/motion.ts`
- Create: `apps/video/src/motion.test.ts`
- Create: `apps/video/src/components/Caption.tsx`
- Create: `apps/video/src/components/OperationalLabel.tsx`
- Create: `apps/video/src/components/DataDisclaimer.tsx`
- Create: `apps/video/src/components/ProductFrame.tsx`
- Create: `apps/video/src/components/CursorClick.tsx`
- Create: `apps/video/src/components/primitives.test.ts`

- [ ] **Step 1: Write failing pure-motion tests**

Test the following invariants:

- micro interaction lasts six frames;
- structural transition lasts eight frames;
- progress clamps at 0 and 1;
- product zoom never exceeds 1.08;
- cursor press scale never drops below 0.92;
- no opacity animation leaves text below 1 after its entrance;
- reduced-motion mode returns settled values immediately.

- [ ] **Step 2: Implement deterministic motion helpers**

`motion.ts` must export `enterProgress`, `transitionProgress`, `productZoom`, `cursorPress` and `settledWhenReduced`. Every interpolation must include explicit left/right clamping and use `cubic-bezier(0.22, 1, 0.36, 1)`.

- [ ] **Step 3: Build the caption system**

`Caption.tsx` rules:

- IBM Plex Sans, 42 px, line-height 1.12, Paper on Volt;
- fixed within 90 px horizontal and 120 px vertical safe areas;
- maximum two lines in voice mode;
- never duplicate identical editorial copy elsewhere in the scene;
- use a solid Volt backing strip only where the underlying product capture reduces contrast.

The sound-off headline may use Manrope at 58–72 px depending on line count, but its measured box must remain inside the safe area.

- [ ] **Step 4: Build operational and disclosure labels**

- `OperationalLabel`: IBM Plex Mono Medium, 28 px, uppercase, no decorative arrow beyond the approved text itself.
- `DataDisclaimer`: IBM Plex Mono Medium, 28 px, full-contrast Paper-on-Volt chip; render on every product scene containing demonstrative numbers.

- [ ] **Step 5: Build the real-product frame**

`ProductFrame.tsx` accepts `shotId`, `mode`, crop coordinates and zoom. It must:

- read only PNGs named in the capture manifest;
- preserve original aspect ratio;
- use a rectangular editorial crop, not a fake device;
- call `TechnicalHoldFrame` for unavailable internal shots;
- throw for unavailable public shots;
- never add glass blur, gradient or glow.

- [ ] **Step 6: Build the click indicator**

`CursorClick.tsx` uses a compact Paper pointer and a single Acid press ring. The ring expands once over six frames and disappears; no loop, bouncing arrow or repeated pulse.

- [ ] **Step 7: Add primitive regression tests**

The tests must inspect rendered props or pure style factories and assert:

- operational labels are at least 28 px;
- safe-area offsets are never below 90/120 px;
- no component contains `backdropFilter`, gradient, blur or purple;
- `TechnicalHoldFrame` cannot render in public mode.

- [ ] **Step 8: Run tests and commit**

```powershell
npm.cmd --workspace apps/video run test
git add apps/video/src/motion.ts apps/video/src/motion.test.ts apps/video/src/components/Caption.tsx apps/video/src/components/OperationalLabel.tsx apps/video/src/components/DataDisclaimer.tsx apps/video/src/components/ProductFrame.tsx apps/video/src/components/CursorClick.tsx apps/video/src/components/primitives.test.ts
git commit -m "feat(video): add Girumo editorial motion primitives"
```

---

## Task 6: Compose all six scenes and both editorial variants

**Files:**

- Create: `apps/video/src/scenes/HookScene.tsx`
- Create: `apps/video/src/scenes/CaptureScene.tsx`
- Create: `apps/video/src/scenes/AutoGrowScene.tsx`
- Create: `apps/video/src/scenes/PublishingScene.tsx`
- Create: `apps/video/src/scenes/AttributionScene.tsx`
- Create: `apps/video/src/scenes/EndCardScene.tsx`
- Create: `apps/video/src/scenes/scenes.test.ts`
- Create: `apps/video/src/compositions/GirumoBrandFilm.tsx`
- Create: `apps/video/src/compositions/GirumoCover.tsx`
- Modify: `apps/video/src/Root.tsx`

- [ ] **Step 1: Write the scene-event test before components**

Define and test this immutable event table:

| Global frame | Event |
|---:|---|
| 0 | Product and hook visible in the first frame; first Deslocamento entrance begins |
| 8 | Hook hierarchy settled |
| 136 | Cursor reaches the real lead CTA |
| 146 | Lead CTA click |
| 158 | Real success state becomes dominant |
| 225 | Auto-grow voice and group-before capture begin |
| 270 | Second Deslocamento passage begins |
| 279 | Real group-after capture becomes dominant |
| 342 | Campaign schedule capture begins |
| 375 | Daily recurrence receives focus |
| 420 | Publication progression begins |
| 459 | Attribution capture and voice begin |
| 501 | Origin chain receives focus |
| 567 | End card and third Deslocamento entrance begin |
| 579 | Official Paper lockup is fully stable |
| 714 | All movement has ended; final six frames are static |

The test must reject any fourth Deslocamento entry.

- [ ] **Step 2: Implement `HookScene` — frames 0–119**

- Show `page-idle` in frame 0; no blank bumper.
- Base Volt with the real page crop occupying the lower/right visual mass.
- Paper Deslocamento enters once at frame 0.
- Voice variant uses the approved hook as the single headline/caption layer.
- Sound-off uses the same sentence, sized for two lines.
- Product zoom moves from 1.04 to 1.08 and stops by frame 112.
- Show `DADOS DEMONSTRATIVOS` when the captured page contains demonstrative content.

- [ ] **Step 3: Implement `CaptureScene` — frames 120–224**

- Begin from the same page crop to preserve continuity.
- Move `CursorClick` to the real CTA at global frame 146.
- Transition from `page-idle` to `lead-success` at global frame 158.
- Show `PÁGINA PRONTA → ACESSO AO GRUPO COM VAGA` once. The real success state must prove persistence plus handoff to the assigned group invitation; do not imply confirmed WhatsApp membership.
- In sound-off mode, use `Páginas prontas liberam o acesso ao grupo com vaga.` as the self-sufficient editorial layer; in voice mode, keep only the operational label.
- No founder voice.
- Show `DADOS DEMONSTRATIVOS` whenever the captured contact is not a real customer.

- [ ] **Step 4: Implement `AutoGrowScene` — frames 225–341**

- Start with `groups-before`, with the real 90% capacity visible.
- Founder voice starts at global frame 225.
- Use the second Deslocamento entry at global frame 270 as a passage between two real screenshots.
- Reveal `groups-after` at global frame 279.
- Show `GRUPO 07 · 90% → GRUPO 08 · CRIADO` once.
- Burn the approved spoken sentence as the voice-mode caption; in sound-off mode, the same sentence becomes the primary editorial layer.
- Never animate an invented group row.
- Show `DADOS DEMONSTRATIVOS` because the capacity percentage and group numbering come from the demonstration account.

- [ ] **Step 5: Implement `PublishingScene` — frames 342–458**

- Use `campaign-scheduled` first and `campaign-published` second.
- Focus the real scheduled time, selected groups and daily recurrence in that order.
- Progress to the real publication audit at global frame 420.
- Show `PREPARE UMA VEZ · TODOS OS GRUPOS · TODOS OS DIAS` once.
- In sound-off mode, use `Prepare uma vez. Publique em todos os grupos, todos os dias.` as the primary editorial layer; in voice mode, keep only the operational label.
- No founder voice.
- Show `DADOS DEMONSTRATIVOS` because the scheduled time, recurrence and execution belong to the demonstration account.

- [ ] **Step 6: Implement `AttributionScene` — frames 459–566**

- Use only the verified `attribution` capture.
- Founder voice uses take 54 without the initial connective.
- A restrained crop move focuses sale, campaign, page and group without drawing a fake connecting diagram.
- Show `VENDA CONFIRMADA · ORIGEM IDENTIFICADA` and `DADOS DEMONSTRATIVOS`.
- Burn the approved spoken sentence as the voice-mode caption; in sound-off mode, the same sentence becomes the primary editorial layer.
- Internal mode shows the technical hold frame until the real attribution UI exists.

- [ ] **Step 7: Implement `EndCardScene` — frames 567–719**

- Full Volt background.
- Third and final Deslocamento entrance begins at frame 567.
- Official horizontal Paper lockup is stable at frame 579.
- Voice uses take 55 with its natural pauses.
- On-screen tagline uses exactly three lines:

```text
Mais grupos lotados.
Menos trabalho.
Mais vendas.
```

- The final six frames contain no movement.
- Do not show an unconfirmed URL, handle or CTA.

- [ ] **Step 8: Compose variants without duplicating the timeline**

`GirumoBrandFilm.tsx` receives `{variant, mode}`. Use the same six `Sequence` components for both variants. Pass `variant` into every scene so it selects the caption hierarchy above. Include `FounderVoiceTrack` only when `variant === "voice"`; always include `SoundBedTrack`. Captions are rendered into the frames and therefore remain present in the MP4 itself.

- [ ] **Step 9: Build the cover from the real hook composition**

`GirumoCover.tsx` uses the hook layout at its settled state:

- exact hook copy;
- real `page-idle` crop;
- official Paper symbol or lockup;
- `DADOS DEMONSTRATIVOS` when the source capture contains demonstrative content;
- no new claim, metric, URL or decorative effect.

- [ ] **Step 10: Register five Remotion IDs**

Create `Root.tsx` with:

```tsx
import "./styles.css";
import {Composition, Still} from "remotion";
import {FILM_DURATION_IN_FRAMES, FILM_FPS, FILM_HEIGHT, FILM_WIDTH} from "./contract";
import {GirumoBrandFilm} from "./compositions/GirumoBrandFilm";
import {GirumoCover} from "./compositions/GirumoCover";

export const RemotionRoot = () => (
  <>
    <Composition
      id="GirumoBrandFilmVoice"
      component={GirumoBrandFilm}
      durationInFrames={FILM_DURATION_IN_FRAMES}
      fps={FILM_FPS}
      width={FILM_WIDTH}
      height={FILM_HEIGHT}
      defaultProps={{variant: "voice", mode: "public"} as const}
    />
    <Composition
      id="GirumoBrandFilmSoundOff"
      component={GirumoBrandFilm}
      durationInFrames={FILM_DURATION_IN_FRAMES}
      fps={FILM_FPS}
      width={FILM_WIDTH}
      height={FILM_HEIGHT}
      defaultProps={{variant: "sound-off", mode: "public"} as const}
    />
    <Composition
      id="GirumoBrandFilmInternalVoice"
      component={GirumoBrandFilm}
      durationInFrames={FILM_DURATION_IN_FRAMES}
      fps={FILM_FPS}
      width={FILM_WIDTH}
      height={FILM_HEIGHT}
      defaultProps={{variant: "voice", mode: "internal"} as const}
    />
    <Composition
      id="GirumoBrandFilmInternalSoundOff"
      component={GirumoBrandFilm}
      durationInFrames={FILM_DURATION_IN_FRAMES}
      fps={FILM_FPS}
      width={FILM_WIDTH}
      height={FILM_HEIGHT}
      defaultProps={{variant: "sound-off", mode: "internal"} as const}
    />
    <Still
      id="GirumoBrandFilmCover"
      component={GirumoCover}
      width={FILM_WIDTH}
      height={FILM_HEIGHT}
      defaultProps={{mode: "public"} as const}
    />
  </>
);
```

- [ ] **Step 11: Run all lightweight checks**

```powershell
npm.cmd --workspace apps/video run assets:sync
npm.cmd --workspace apps/video run audio:generate-bed
npm.cmd --workspace apps/video run test
npm.cmd --workspace apps/video run typecheck
```

Expected: all tests and TypeScript pass without requiring public captures.

- [ ] **Step 12: Commit scenes and compositions**

```powershell
git add apps/video/src/scenes apps/video/src/compositions apps/video/src/Root.tsx
git commit -m "feat(video): compose the 24-second Girumo brand film"
```

---

## Task 7: Render the internal preview and run visual QA

**Files:**

- Create: `apps/video/scripts/license-gate.ts`
- Create: `apps/video/scripts/license-gate.test.ts`
- Create: `apps/video/scripts/render-review.ts`
- Create: `apps/video/scripts/render-review.test.ts`
- Create: `apps/video/scripts/review-fingerprint.ts`
- Create: `apps/video/scripts/review-fingerprint.test.ts`
- Create: `apps/video/production/review-approval.json`

- [ ] **Step 1: Write the license-gate tests**

Accepted explicit values:

```ts
export const ACCEPTED_REMOTION_LICENSE_STATUS = ["free-eligible", "company-licensed"] as const;
```

Reject missing, empty and `unreviewed` values. If the value is `company-licensed`, require a non-empty `REMOTION_LICENSE_KEY`; if it is `free-eligible`, do not require a key. The error must link to `https://www.remotion.dev/license` and state that it is a production gate, not legal advice.

- [ ] **Step 2: Capture and review the real opening frame**

With the web app running in a separate terminal, capture only the allowed pre-trigger state:

```powershell
npm.cmd --workspace apps/video run capture -- --before-only page-idle
```

Open `apps/video/public/captures/page-idle.png` at original resolution. Reject it if it contains personal data, unlicensed catalog media, legacy HubFlow identity, purple or a gradient. Record approved privacy and catalog authorization in the manifest and retain its computed hash. The internal render must fail if this opening shot is absent or unreviewed; all other unavailable shots may remain explicit technical holds.

- [ ] **Step 3: Implement a content-bound review fingerprint**

`review-fingerprint.ts` must compute one deterministic SHA-256 over a canonical, sorted JSON payload containing:

- the exact bytes of every production file under `apps/video/src/**` and `apps/video/scripts/**`, excluding `*.test.ts`, `*.test.tsx` and the mutable approval file;
- the exact bytes of root `package.json`, root `package-lock.json`, `apps/video/package.json`, `apps/video/tsconfig.json` and `apps/video/remotion.config.ts`;
- shot ID, status, capture SHA-256, execution ID and product commit from the capture manifest;
- raw and processed founder-audio SHA-256 values plus the generated sound-bed hash;
- every source/destination hash from `public/brand/sync-report.json`.
- the SHA-256 of both rendered internal MP4 previews.

Write the payload and resulting hash to ignored `dist/review/review-fingerprint.json`. Tests must prove stable ordering and prove that changing any one source/configuration byte, capture/audio/brand hash or preview byte changes the fingerprint. The public render recalculates this same payload and fails when either approved preview file is missing.

- [ ] **Step 4: Implement the internal render script**

`render-review.ts` must:

1. load `.env.local`;
2. assert license status;
3. sync brand assets;
4. confirm the four local M4A hashes;
5. process the four WAV files and verify their audio analysis;
6. generate the sound bed and SRT;
7. bundle `src/index.ts` once;
8. require the real, hash-matching and manually reviewed `page-idle` capture;
9. render `GirumoBrandFilmInternalVoice` and `GirumoBrandFilmInternalSoundOff` as H.264/AAC to their two review paths, passing `licenseKey` when present and `isProduction: false` for licensed development renders;
10. render voice-variant stills at global frames `0`, `120`, `225`, `342`, `459`, `567`;
11. combine them into a 3 × 2 contact sheet using Sharp;
12. leave every technical hold frame visibly marked `NÃO PUBLICAR`;
13. compute and print the content-bound review fingerprint after all inputs are finalized.

- [ ] **Step 5: Create the review approval contract**

Initial `review-approval.json`:

```json
{
  "revision": "girumo-film-2026-07-18",
  "fingerprint": null,
  "status": "not-reviewed",
  "variants": {
    "voice": "not-reviewed",
    "soundOff": "not-reviewed"
  },
  "reviewedAt": null,
  "reviewer": null,
  "notes": []
}
```

The public render script will require `status: "approved"`, both variants set to `approved`, the matching revision and a fingerprint equal to a fresh calculation over the current files. Any source, capture, audio or brand-asset change invalidates the approval.

- [ ] **Step 6: Render both previews**

After classifying the Remotion license in `.env.local`, run:

```powershell
npm.cmd run video:review
```

Expected outputs:

- `apps/video/dist/review/girumo-brand-film-internal-voice-preview.mp4`
- `apps/video/dist/review/girumo-brand-film-internal-sound-off-preview.mp4`
- `apps/video/dist/review/girumo-brand-film-contact-sheet.png`
- `apps/video/dist/review/review-fingerprint.json`

- [ ] **Step 7: Inspect the contact sheet and both previews**

Use the local image viewer and verify:

- first frame already contains product and hook;
- no scene resembles a generic SaaS card deck;
- captions are readable at phone size;
- Acid appears only as action/state;
- no legacy purple, gradient or HubFlow mark;
- Deslocamento geometry remains exact;
- all unavailable product scenes say `PRÉVIA INTERNA` and `NÃO PUBLICAR`;
- the final lockup is the official outlined asset;
- no phone, email, token or personal name is visible.
- the sound-off preview communicates the complete story without founder voice;
- the narrated preview keeps every spoken word intelligible over the bed.

- [ ] **Step 8: Share both internal previews for user review**

Stop public rendering at this point. Provide links to both MP4 files, the contact sheet and the fingerprint. Update `review-approval.json` only after explicit user approval of both variants for this exact fingerprint.

- [ ] **Step 9: Commit review infrastructure, not generated media**

```powershell
git add apps/video/scripts/license-gate.ts apps/video/scripts/license-gate.test.ts apps/video/scripts/render-review.ts apps/video/scripts/render-review.test.ts apps/video/scripts/review-fingerprint.ts apps/video/scripts/review-fingerprint.test.ts apps/video/production/review-approval.json
git commit -m "feat(video): add Girumo film review pipeline"
```

---

## Task 8: Replace every technical hold with verified real product captures

**Files:**

- Modify: `apps/video/production/capture-manifest.json`
- Local only: `apps/video/public/captures/*.png`

This task begins only after the corresponding product work exists. It does not implement that product work.

- [ ] **Step 1: Verify the external product prerequisites**

Require evidence for all four independent capabilities:

| Capability | Required state before capture |
|---|---|
| Group assignment and capacity | `/p/[slug]`, routing and campaign management use the same active Supabase source; form submission persists the contact and hands it to the invitation of the assigned group with a real vacancy. This proves the access path, not confirmed WhatsApp membership |
| Auto-grow | `autoGrow` and its template persist; the actual worker creates the next group; the UI shows before and after states |
| Recurring publication | campaign messages with `campaign_message_id` are executed, recur daily and expose an audit status in Agenda |
| Sale attribution | Resultados shows sale → contact → campaign → page → group for the same demonstrative transaction |

Record the product commit SHA for each shot. A screenshot of static seeded rows without actual execution does not satisfy the gate.

- [ ] **Step 2: Prepare one coherent demonstration account**

The same account must contain:

- one authorized clothing collection;
- one published Girumo page;
- Group 07 at 89% and no Group 08 before the auto-grow scenario runs; the scenario's real contact takes Group 07 to the 90% trigger state captured in `groups-before`;
- one recurring daily offer ready to be scheduled and processed by the recurring-publication scenario;
- one fictional demonstrative contact and a deterministic sale trigger ready for the sale-attribution scenario, with no matching result row before that trigger runs.

Use fictional contact data that cannot identify a person. Keep group and campaign naming consistent across every route.

- [ ] **Step 3: Capture the real states**

Set each now-available atomic scenario to `capture-ready`, start the app, then run:

```powershell
npm.cmd run web:dev
npm.cmd --workspace apps/video run capture
```

The web process and capture command should run in separate terminals. For each scenario, the capture command must establish and capture the initial state, perform the real trigger, require the result evidence and capture the final state under the same execution ID. It must leave all eight shots as `captured`, with hash and timestamp. A pre-created Group 08, a static seeded publication row or an attribution row without its matching transaction evidence fails the run.

- [ ] **Step 4: Perform privacy and brand review on every PNG**

Open every capture at original resolution. For each approved file:

- set `privacyReview` to `approved`;
- set `catalogAuthorization` to `approved`;
- set `productCommit` to the verified SHA;
- set `status` to `verified`;
- retain the exact SHA-256 produced by the capture script.

Reject and recapture on any personal phone, email, invite link, old HubFlow name, purple legacy color, gradient or unlicensed catalog asset.

- [ ] **Step 5: Run the public capture gate**

```powershell
npm.cmd --workspace apps/video run capture:verify -- --mode public
```

Expected: all eight shots report `verified`, exact hash match, paired execution ID, approved privacy and approved catalog authorization.

- [ ] **Step 6: Render a capture-complete internal preview**

```powershell
npm.cmd run video:review
```

Expected: no technical hold frame appears. Inspect and share both variants to validate the final captures, but treat this fingerprint as provisional because Task 9 still adds production scripts included in the fingerprint. Do not approve or modify `review-approval.json` yet.

- [ ] **Step 7: Commit only capture evidence metadata**

```powershell
git add apps/video/production/capture-manifest.json
git commit -m "docs(video): verify Girumo product capture evidence"
```

---

## Task 9: Render, inspect and release the final deliverables

**Files:**

- Create: `apps/video/scripts/render-deliverables.ts`
- Create: `apps/video/scripts/render-deliverables.test.ts`
- Create: `apps/video/scripts/verify-deliverables.ts`
- Create: `apps/video/scripts/verify-deliverables.test.ts`
- Create: `apps/video/scripts/release-check.ts`
- Create: `apps/video/scripts/release-check.test.ts`
- Create: `apps/video/README.md`
- Modify: `apps/video/production/review-approval.json`
- Modify: `docs/brand/girumo/copy-library.md`

- [ ] **Step 1: Write failing render-plan tests**

The test must assert exactly six public files from the Delivery Contract and these profiles:

| Profile | Composition | CRF | Audio |
|---|---|---:|---|
| master voice | `GirumoBrandFilmVoice` | 14 | AAC 320k, 48 kHz |
| master sound-off | `GirumoBrandFilmSoundOff` | 14 | AAC 320k, 48 kHz |
| publish voice | `GirumoBrandFilmVoice` | 20 | AAC 192k, 48 kHz |
| publish sound-off | `GirumoBrandFilmSoundOff` | 20 | AAC 192k, 48 kHz |
| cover | `GirumoBrandFilmCover` | PNG | no audio |
| captions | generated SRT | text | no audio |

- [ ] **Step 2: Implement the final render script**

Before bundling, `render-deliverables.ts` must require:

- accepted Remotion license status;
- public capture gate passing;
- approved review with matching revision, both variants explicitly approved and fingerprint equal to a fresh calculation over the current source, capture, audio and brand inputs;
- four raw-audio hash matches;
- four processed-WAV audio-analysis checks;
- local brand asset hash matches.

Bundle once, select each composition, then call `renderMedia` with codec `h264`, audio codec `aac`, image format `png`, pixel format `yuv420p`, color space `bt709`, `sampleRate: 48000`, the profile values above, `licenseKey` when present and `isProduction: true`. Call `renderStill` for the cover with the same applicable key. Never continue after a failed preflight.

- [ ] **Step 3: Verify rendered metadata with Mediabunny**

For each MP4, use `Input`, `ALL_FORMATS` and `BlobSource` from Mediabunny. Export the reusable async function `verifyDeliverables()` from `verify-deliverables.ts`, keep CLI execution behind the direct-entry guard, and assert:

```ts
assert.equal(await videoTrack.getDisplayWidth(), 1080);
assert.equal(await videoTrack.getDisplayHeight(), 1350);
assert.equal(await videoTrack.getCodec(), "avc");
assert.equal(await audioTrack.getCodec(), "aac");
assert.equal(await audioTrack.getSampleRate(), 48000);
assert.ok(Math.abs((await input.computeDuration()) - 24) <= 1 / 30);
```

Also assert:

- cover PNG is exactly 1080 × 1350 using Sharp metadata;
- SRT has four ordered, non-overlapping cues;
- filenames and directories match the Delivery Contract;
- every output is non-empty;
- sound-off files contain an audio track for music/SFX but no founder voice component.

- [ ] **Step 4: Add the approved attribution promise to the official copy library**

Add under the appropriate results/functional-claims section:

```text
Você sabe exatamente de onde veio cada venda.
```

Document that it may only be used while the verified attribution chain remains operational.

- [ ] **Step 5: Implement the release check**

`release-check.ts` must import and await `verifyDeliverables()` directly, then fail unless:

- the reusable deliverable verifier passes without spawning or recursively calling an npm script;
- the exact attribution sentence exists in `docs/brand/girumo/copy-library.md`;
- no public asset contains `HubFlow` or prohibited language;
- `GIRUMO_LEGAL_NAME_STATUS=cleared` is explicitly set after the professional INPI and legal review required by the identity specification.

The script must explain that the legal flag records an external decision; it does not perform trademark analysis.

- [ ] **Step 6: Document the operator workflow**

`apps/video/README.md` must cover:

1. Node and npm requirements;
2. license classification;
3. local audio import;
4. brand asset sync;
5. product capture manifest;
6. internal preview;
7. final render;
8. metadata verification;
9. release check;
10. output paths;
11. privacy rules;
12. how to keep raw media out of Git.

- [ ] **Step 7: Render and approve the final fingerprinted review**

After every production script and documentation input above exists, run:

```powershell
npm.cmd run video:check
npm.cmd run video:review
```

Expected: both internal previews render with no technical hold; `review-fingerprint.json` now includes every final production source/configuration byte and both MP4 hashes. Share both previews, the contact sheet and this final fingerprint. Stop until the user explicitly approves the narrated and sound-off variants. Then set `status`, both variant statuses, reviewer, timestamp and this exact fingerprint in `review-approval.json`. Any later source, capture, audio, brand, configuration or preview change requires rerunning this step and obtaining a new approval.

- [ ] **Step 8: Run the full production pipeline**

```powershell
npm.cmd run video:check
npm.cmd run video:render
npm.cmd run video:verify
npm.cmd --workspace apps/video run release:check
```

Expected:

- all tests and TypeScript pass;
- four MP4 renders complete;
- cover and SRT exist;
- every metadata assertion passes;
- release check passes only when the external legal flag is cleared.

- [ ] **Step 9: Inspect the final artifacts**

Inspect the cover and a fresh six-frame contact sheet at original resolution. Watch both MP4s on a phone-sized viewport and verify:

- voice remains intelligible over the sound bed;
- take 50 hooks quickly;
- take 46 fits without compression;
- take 54 begins on “Você” with no audible clipped connective;
- take 55 closes naturally and the mark remains readable;
- the sound-off version communicates the complete argument by text;
- no frame has personal data or unverifiable UI;
- no platform control covers essential text;
- no visible motion continues in the final six frames.

- [ ] **Step 10: Commit production scripts and documentation**

```powershell
git add apps/video/scripts/render-deliverables.ts apps/video/scripts/render-deliverables.test.ts apps/video/scripts/verify-deliverables.ts apps/video/scripts/verify-deliverables.test.ts apps/video/scripts/release-check.ts apps/video/scripts/release-check.test.ts apps/video/README.md apps/video/production/review-approval.json docs/brand/girumo/copy-library.md
git commit -m "feat(video): add verified Girumo film delivery pipeline"
```

Generated MP4, PNG, SRT, captures and raw audio remain outside Git and are handed to the user through their absolute local paths.

---

## Final Verification Checklist

- [ ] `npm.cmd run video:check` passes.
- [ ] Timeline is exactly 720 frames at 30 fps.
- [ ] Canvas is exactly 1080 × 1350.
- [ ] Voice selection is exactly 50 + 46 + trimmed 54 + 55.
- [ ] No audio file was uploaded externally or committed.
- [ ] All eight product evidence shots are verified as four paired before/after executions against real product behavior.
- [ ] Public render contains no technical hold frame.
- [ ] Both variants use the same timeline and scene components.
- [ ] Sound-off variant is fully understandable without narration.
- [ ] Brand assets and fonts match canonical hashes.
- [ ] No legacy HubFlow identity, purple, gradient, generic SaaS UI or AI footage appears.
- [ ] `DADOS DEMONSTRATIVOS` is at least 28 px wherever needed.
- [ ] No personal data, phone, email, token or invite URL appears.
- [ ] Four MP4 files, cover and SRT match the Delivery Contract.
- [ ] H.264/AAC, 48 kHz, duration and dimensions pass Mediabunny verification.
- [ ] User approved the narrated and sound-off variants for the exact final-capture fingerprint.
- [ ] Attribution claim exists in the official copy library and remains operational.
- [ ] Professional INPI/legal review is recorded before public release.
