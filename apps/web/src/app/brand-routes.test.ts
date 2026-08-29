import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { BRAND } from "../lib/brand";
import manifest from "./manifest";
import robots from "./robots";
import sitemap from "./sitemap";

const appRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

test("publishes the approved Girumo install metadata", () => {
  const value = manifest();

  assert.equal(value.name, BRAND.name);
  assert.equal(value.short_name, BRAND.name);
  assert.equal(value.theme_color, "#071923");
  assert.deepEqual(value.icons?.map((item) => item.src), [
    "/brand/girumo/png/symbol-192.png",
    "/brand/girumo/png/symbol-512.png",
  ]);
  assert.deepEqual(value.shortcuts?.map((item) => item.url), [
    "/painel/campanhas",
    "/painel/grupos",
    "/painel/pages",
  ]);
});

test("evaluates NEXT_PUBLIC_SITE_URL when discovery routes are called", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/";
    assert.equal(robots().host, "https://example.test");
    assert.equal(robots().sitemap, "https://example.test/sitemap.xml");
    assert.equal(sitemap()[0].url, "https://example.test");

    process.env.NEXT_PUBLIC_SITE_URL = "https://outro.example";
    assert.equal(robots().host, "https://outro.example");
    assert.equal(sitemap()[0].url, "https://outro.example");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("falls back to the Girumo discovery host", () => {
  // O host transitório hubflow.com.br foi aposentado em 12/ago/2026, depois da
  // migração de produção (NEXT_PUBLIC_SITE_URL setada + redeploy). Este fallback
  // só é exercitado em ambiente mal configurado, e nesse caso tem que apontar
  // pro domínio vivo — buscador não deve descobrir o host antigo.
  // O host vivo é o www: o apex responde 308 pro www, então declarar o apex
  // aqui faria toda URL do sitemap nascer como redirect.
  const previous = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(robots().host, "https://www.girumo.com.br");
    assert.equal(sitemap()[0].url, "https://www.girumo.com.br");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("sources root metadata and social preview from the brand contract", () => {
  const source = read("src/app/layout.tsx");
  const pageSource = read("src/app/page.tsx");
  const openGraphStart = source.indexOf("openGraph:");
  const twitterStart = source.indexOf("twitter:");
  const openGraphSource = source.slice(openGraphStart, twitterStart);
  const twitterSource = source.slice(twitterStart);
  const ogAssetPath = path.join(appRoot, "public", BRAND.ogAsset.replace(/^\/+/, ""));

  assert.match(source, /import\s+\{\s*BRAND,\s*getPublicSiteUrl\s*\}\s+from\s+["']@\/lib\/brand["']/);
  assert.match(source, /metadataBase:\s*new URL\(getPublicSiteUrl\(\)\)/);
  assert.match(source, /default:\s*`\$\{BRAND\.name\}\s+—\s+\$\{BRAND\.tagline\}`/);
  assert.match(source, /template:\s*`%s\s+\|\s+\$\{BRAND\.name\}`/);
  assert.match(source, /description:\s*BRAND\.description/);
  assert.ok(openGraphStart >= 0 && twitterStart > openGraphStart, "metadata social sections");
  assert.match(openGraphSource, /images:\s*\[BRAND\.ogAsset\]/);
  assert.match(twitterSource, /images:\s*\[BRAND\.ogAsset\]/);
  assert.equal(existsSync(ogAssetPath), true, BRAND.ogAsset);
  assert.doesNotMatch(source, /HubFlow|\/product\/painel-home\.png/);
  // A home mantém um título SEO próprio (absoluto, rico em keyword). O contrato de
  // marca global (default/template a partir de BRAND) é imposto no layout.tsx e já
  // coberto acima. Aqui garantimos só: título absoluto declarado, Girumo presente,
  // e nunca "HubFlow".
  assert.match(pageSource, /title:\s*\{\s*absolute:\s*\S/);
  assert.match(pageSource, /Girumo/);
  assert.doesNotMatch(pageSource, /HubFlow/i);
  assert.match(pageSource, /images:\s*\[BRAND\.ogAsset\]/);
  assert.doesNotMatch(pageSource, /\/product\/painel-home\.png/);
});

test("points both production env examples at the Girumo hosts", () => {
  for (const relativePath of [
    ".env.production.example",
    "../../deploy/vercel/.env.production.example",
  ]) {
    const source = read(relativePath);
    const whatsappUrl = source.match(/^NEXT_PUBLIC_SALES_WHATSAPP_URL=(.+)$/m)?.[1] ?? "";

    assert.doesNotMatch(decodeURIComponent(whatsappUrl), /HubFlow/i, relativePath);
    assert.match(source, /^NEXT_PUBLIC_SITE_URL=https:\/\/www\.girumo\.com\.br$/m, relativePath);
    assert.match(source, /^NEXT_PUBLIC_APP_URL=https:\/\/app\.girumo\.com\.br$/m, relativePath);
    assert.doesNotMatch(source, /^NEXT_PUBLIC_(SITE|APP)_URL=.*hubflow/m, relativePath);
  }
});

test("mantém as páginas de terceiros fora do rastreio", () => {
  const disallow = robots().rules;
  const rules = Array.isArray(disallow) ? disallow : [disallow];
  const paths = rules.flatMap((rule) =>
    Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
  );

  // LPs dos lojistas e o redirect de link rastreado: conteúdo de terceiros, em
  // volume, que diluiria o portfólio finito de páginas do plano de SEO. O gate
  // real é o `index: false` no metadata de cada uma — isto só poupa orçamento
  // de rastreio.
  assert.ok(paths.includes("/p/"), "as LPs dos lojistas precisam sair do rastreio");
  assert.ok(paths.includes("/r/"), "o redirect de link rastreado precisa sair do rastreio");
  assert.ok(paths.includes("/painel"), "a área logada continua fora");
  assert.ok(paths.includes("/api"), "as rotas internas continuam fora");
});
