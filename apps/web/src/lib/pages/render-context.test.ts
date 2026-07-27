import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const corePath = path.join(process.cwd(), "src", "lib", "pages", "render-context-core.ts");
const coreUrl = pathToFileURL(corePath).href;
const serverWrapperPath = path.join(
  process.cwd(),
  "src",
  "lib",
  "pages",
  "render-context.ts",
);
const TEST_SECRET = "render-context-test-secret-with-enough-entropy";

const renderEvidence = {
  slug: "bazar-da-vila",
  publishedVersion: 7,
  structure: "conversion",
  visualDirection: "premium",
  modelVersion: 2,
  noticeVersion: "lgpd-v2",
  noticeText:
    "Ao continuar, voce solicita acesso ao grupo. Politica de Privacidade.",
};

async function loadCore() {
  assert.equal(existsSync(corePath), true, "render-context-core.ts ainda nao existe");
  return import(coreUrl) as Promise<{
    signRenderContext: (
      value: typeof renderEvidence,
      secret: string,
    ) => string;
    verifyRenderContext: (
      token: string,
      expectedSlug: string,
      secret: string,
    ) =>
      | { ok: true; value: typeof renderEvidence }
      | { ok: false; reason: "invalid" | "slug_mismatch" };
    isRenderContextStale: (
      value: typeof renderEvidence,
      page: { slug: string; published_version: number } | null,
    ) => boolean;
  }>;
}

test("token valido preserva somente o contexto publico allowlisted", async () => {
  const { signRenderContext, verifyRenderContext } = await loadCore();
  const token = signRenderContext(renderEvidence, TEST_SECRET);
  const verified = verifyRenderContext(token, renderEvidence.slug, TEST_SECRET);

  assert.deepEqual(verified, { ok: true, value: renderEvidence });

  const [encodedPayload] = token.split(".");
  const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(decoded).sort(), [
    "modelVersion",
    "noticeText",
    "noticeVersion",
    "publishedVersion",
    "slug",
    "structure",
    "visualDirection",
  ]);
  for (const sensitiveKey of [
    "tenantId",
    "landingPageId",
    "targetGroupUrl",
    "redirectUrl",
    "campaignSlug",
    "metaPixelId",
    "ga4Id",
  ]) {
    assert.equal(sensitiveKey in decoded, false);
  }
});

test("token adulterado e rejeitado", async () => {
  const { signRenderContext, verifyRenderContext } = await loadCore();
  const token = signRenderContext(renderEvidence, TEST_SECRET);
  const [, signature] = token.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...renderEvidence, publishedVersion: 99 }),
  ).toString("base64url");

  assert.deepEqual(
    verifyRenderContext(
      `${tamperedPayload}.${signature}`,
      renderEvidence.slug,
      TEST_SECRET,
    ),
    { ok: false, reason: "invalid" },
  );
  assert.deepEqual(
    verifyRenderContext(`${token}!`, renderEvidence.slug, TEST_SECRET),
    { ok: false, reason: "invalid" },
  );
});

test("token assinado para outro slug e rejeitado", async () => {
  const { signRenderContext, verifyRenderContext } = await loadCore();
  const token = signRenderContext(renderEvidence, TEST_SECRET);

  assert.deepEqual(
    verifyRenderContext(token, "outra-pagina", TEST_SECRET),
    { ok: false, reason: "slug_mismatch" },
  );
});

test("contexto fica stale quando a pagina e republicada", async () => {
  const { isRenderContextStale } = await loadCore();

  assert.equal(
    isRenderContextStale(renderEvidence, {
      slug: renderEvidence.slug,
      published_version: renderEvidence.publishedVersion,
    }),
    false,
  );
  assert.equal(
    isRenderContextStale(renderEvidence, {
      slug: renderEvidence.slug,
      published_version: renderEvidence.publishedVersion + 1,
    }),
    true,
  );
  assert.equal(isRenderContextStale(renderEvidence, null), true);
});

test("wrapper server-only resolve AUTH_SECRET sem expor o segredo ao client", async () => {
  assert.equal(
    existsSync(serverWrapperPath),
    true,
    "render-context.ts server-only ainda nao existe",
  );
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(serverWrapperPath, "utf8");

  assert.match(source, /import "server-only"/);
  assert.match(
    source,
    /resolveSecret\(\s*"AUTH_SECRET",\s*process\.env\.AUTH_SECRET,\s*process\.env\.NODE_ENV,/,
  );
  assert.doesNotMatch(source, /export\s+(?:const|let|var)\s+AUTH_SECRET/);
});
