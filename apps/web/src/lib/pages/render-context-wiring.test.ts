import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

const pageSource = source("src", "app", "p", "[slug]", "page.tsx");
const trackingSource = source(
  "src",
  "components",
  "pages",
  "tracking-scripts.tsx",
);
const v2FormSource = source(
  "src",
  "components",
  "pages",
  "templates",
  "sections",
  "lead-form-fields.tsx",
);
const legacyFormSource = source(
  "src",
  "components",
  "pages",
  "lead-form.tsx",
);
const templateContractSource = source(
  "src",
  "components",
  "pages",
  "templates",
  "index.ts",
);
const structureContractSource = source(
  "src",
  "components",
  "pages",
  "templates",
  "contract.ts",
);
const leadRouteSource = source(
  "src",
  "app",
  "api",
  "p",
  "lead",
  "route.ts",
);
const trackingRouteSource = source(
  "src",
  "app",
  "api",
  "p",
  "track",
  "route.ts",
);

test("render server-side assina a versao e propaga o contexto sem destinos", () => {
  assert.match(pageSource, /createRenderContextToken\(\{/);
  assert.match(pageSource, /slug,\s+publishedVersion:/);
  assert.match(pageSource, /noticeText(?:\s*:\s*noticeText)?\s*,/);
  assert.ok(
    (pageSource.match(/renderContext=\{renderContext\}/g) ?? []).length >= 3,
    "estrutura/template/tracking devem receber o mesmo contexto assinado",
  );
  assert.doesNotMatch(
    pageSource,
    /createRenderContextToken\(\{[\s\S]*?(?:tenant_id|target_group_url|campaign_slug|meta_pixel_id|ga4_id)[\s\S]*?\}\)/,
  );
});

test("forms e beacons enviam o mesmo contexto do render", () => {
  assert.match(templateContractSource, /renderContext\?: string/);
  assert.match(structureContractSource, /renderContext\?: string/);
  assert.match(trackingSource, /render_context:\s*renderContext/);
  assert.match(v2FormSource, /render_context:\s*renderContext/);
  assert.match(legacyFormSource, /render_context:\s*renderContext/);
  assert.doesNotMatch(trackingSource, /trackBeacon\(slug,\s*"page_view"/);
  assert.doesNotMatch(v2FormSource, /trackBeacon\(slug,\s*"(?:form_start|lead_submit_attempt|group_click)"/);
  assert.doesNotMatch(legacyFormSource, /trackBeacon\(slug,\s*"(?:form_start|lead_submit_attempt|group_click)"/);
});

test("captura rejeita render stale antes de gravar ou resolver destino", () => {
  assert.match(leadRouteSource, /body\.render_context/);
  assert.match(leadRouteSource, /verifyRenderContextToken\(renderContextToken,\s*slug\)/);
  assert.match(leadRouteSource, /isRenderContextStale\(renderContext,\s*page\)/);
  assert.match(
    leadRouteSource,
    /isRenderContextStale[\s\S]*Recarregue[\s\S]*status:\s*409/i,
  );

  const verifyIndex = leadRouteSource.indexOf("verifyRenderContextToken(");
  const staleIndex = leadRouteSource.indexOf("isRenderContextStale(");
  const destinationIndex = leadRouteSource.indexOf("resolveTargetUrl(");
  const captureIndex = leadRouteSource.indexOf("await confirmLpCapture(");
  assert.ok(verifyIndex >= 0 && verifyIndex < staleIndex);
  assert.ok(staleIndex < destinationIndex);
  assert.ok(staleIndex < captureIndex);

  assert.match(leadRouteSource, /publishedVersion:\s*renderContext\.publishedVersion/);
  assert.match(leadRouteSource, /structure:\s*renderContext\.structure/);
  assert.match(leadRouteSource, /visualDirection:\s*renderContext\.visualDirection/);
  assert.match(leadRouteSource, /modelVersion:\s*renderContext\.modelVersion/);
  assert.match(leadRouteSource, /noticeVersion:\s*renderContext\.noticeVersion/);
  assert.match(leadRouteSource, /noticeText:\s*renderContext\.noticeText/);
  assert.doesNotMatch(leadRouteSource, /noticeTextFor\(page\.content\)/);
});

test("tracking atribui a versao renderizada e rejeita contexto stale", () => {
  assert.match(trackingRouteSource, /body\.render_context/);
  assert.match(
    trackingRouteSource,
    /verifyRenderContextToken\(renderContextToken,\s*slug\)/,
  );
  assert.match(
    trackingRouteSource,
    /isRenderContextStale\(renderContext,\s*page\)/,
  );
  assert.match(
    trackingRouteSource,
    /isRenderContextStale[\s\S]*Recarregue[\s\S]*status:\s*409/i,
  );

  const staleIndex = trackingRouteSource.indexOf("isRenderContextStale(");
  const insertIndex = trackingRouteSource.indexOf("await insertLpTrackingEvent(");
  assert.ok(staleIndex >= 0 && staleIndex < insertIndex);

  assert.match(
    trackingRouteSource,
    /publishedVersion:\s*renderContext\.publishedVersion/,
  );
  assert.match(trackingRouteSource, /structure:\s*renderContext\.structure/);
  assert.match(
    trackingRouteSource,
    /visualDirection:\s*renderContext\.visualDirection/,
  );
  assert.match(trackingRouteSource, /modelVersion:\s*renderContext\.modelVersion/);
  assert.doesNotMatch(
    trackingRouteSource,
    /publishedVersion:\s*page\.published_version/,
  );
});
