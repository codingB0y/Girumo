import assert from "node:assert/strict";
import test from "node:test";
import { buildCsp, generateNonce, nonceAttribute, surfaceForPath } from "./csp";

/**
 * Cópia do regex que o Next usa pra extrair o nonce do header da request
 * (next/dist/server/app-render/get-script-nonce-from-header.js, 15.5.19).
 * Se o nosso nonce sair fora dele, o Next ignora em silêncio, os scripts saem
 * sem nonce e a página inteira quebra. Este teste é o alarme.
 */
const NEXT_NONCE_SOURCE_REGEX = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/;

function nonceSeenByNext(csp: string): string | undefined {
  const directive =
    csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ??
    csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("default-src"));
  if (!directive) return undefined;
  for (const source of directive.split(/\s+/).slice(1)) {
    const match = source.trim().match(NEXT_NONCE_SOURCE_REGEX);
    if (match) return match[1];
  }
}

test("nonce surfaces are the routes that render per request", () => {
  assert.equal(surfaceForPath("/p/loja-teste"), "public-lp");
  assert.equal(surfaceForPath("/r/abc123"), "click-redirect");
});

test("pre-rendered routes get no nonce", () => {
  // Estas viram .html no build — nonce por-request nunca bateria (ver csp.ts).
  for (const path of ["/", "/login", "/lp", "/home-v2", "/painel/campanhas", "/admin"]) {
    assert.equal(surfaceForPath(path), null, `${path} não pode receber nonce`);
  }
});

test("paths that merely start with the same letters are not matched", () => {
  assert.equal(surfaceForPath("/painel"), null);
  assert.equal(surfaceForPath("/posts/og"), null);
  assert.equal(surfaceForPath("/reset-password"), null);
  assert.equal(surfaceForPath("/api/p/lead"), null);
});

test("nonce is unique per call and readable by Next", () => {
  const first = generateNonce();
  const second = generateNonce();
  assert.notEqual(first, second);
  assert.equal(nonceSeenByNext(buildCsp("public-lp", first, false)), first);
  assert.equal(nonceSeenByNext(buildCsp("click-redirect", first, false)), first);
});

test("production script-src drops unsafe-inline and unsafe-eval", () => {
  for (const surface of ["public-lp", "click-redirect"] as const) {
    const scriptSrc = buildCsp(surface, generateNonce(), false)
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), `${surface} ainda tem unsafe-inline`);
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), `${surface} ainda tem unsafe-eval`);
  }
});

test("unsafe-eval comes back only in dev, where Turbopack needs it", () => {
  const dev = buildCsp("public-lp", generateNonce(), true);
  assert.ok(dev.includes("'unsafe-eval'"));
  assert.ok(!dev.includes("'unsafe-inline' 'nonce-"));
});

test("public LP keeps the vendors the tracking session injects", () => {
  const csp = buildCsp("public-lp", generateNonce(), false);
  assert.ok(csp.includes("https://connect.facebook.net"));
  assert.ok(csp.includes("https://www.googletagmanager.com"));
  // A foto do lojista vem de URL https arbitrária.
  assert.ok(csp.includes("img-src 'self' data: https:"));
  // O destino nunca é embutido: frame só dos provedores de vídeo do depoimento.
  assert.ok(csp.includes("frame-src https://www.youtube-nocookie.com https://player.vimeo.com"));
});

test("nonce attribute renders only for a well-formed nonce", () => {
  const nonce = generateNonce();
  assert.equal(nonceAttribute(nonce), ` nonce="${nonce}"`);
  assert.equal(nonceAttribute(null), "");
  assert.equal(nonceAttribute(""), "");
});

test("nonce attribute refuses anything that could break out of the attribute", () => {
  // O valor só deveria vir do middleware, mas quem monta HTML concatenando não
  // pode depender disso: nada com aspas, espaço ou tag pode virar atributo.
  for (const forged of [
    'abc" onload="alert(1)',
    "abc><script>alert(1)</script>",
    "abc def",
    "abc'",
    "curto",
    "tem_underscore_invalido_pra_base64",
  ]) {
    assert.equal(nonceAttribute(forged), "", `deixou passar: ${forged}`);
  }
});

test("click interstitial stays closed to everything but the ad tags", () => {
  const csp = buildCsp("click-redirect", generateNonce(), false);
  assert.ok(csp.includes("frame-src 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("connect-src https://www.facebook.com"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("form-action 'self'"));
  // A allowlist de script é FECHADA: só os dois hosts de tag entram. Host novo
  // aqui tem de ser uma decisão consciente, não um efeito colateral.
  const hostsDeScript = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "")
    .split(" ")
    .filter((t) => t.startsWith("https://"));
  assert.deepEqual(hostsDeScript.sort(), ["https://connect.facebook.net", "https://www.googletagmanager.com"]);
});

test("click-redirect libera o gtag: script, img e connect do Google", () => {
  const csp = buildCsp("click-redirect", generateNonce(), false);
  const dir = (nome: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(nome)) ?? "";
  assert.match(dir("script-src"), /https:\/\/www\.googletagmanager\.com/);
  assert.match(dir("connect-src"), /https:\/\/\*\.google-analytics\.com/);
  assert.match(dir("connect-src"), /https:\/\/\*\.analytics\.google\.com/);
  // A conversão do Google Ads chega como PIXEL (img), não como fetch.
  assert.match(dir("img-src"), /https:\/\/www\.google\.com/);
  assert.match(dir("img-src"), /https:\/\/googleads\.g\.doubleclick\.net/);
});

test("click-redirect continua sem 'unsafe-inline' e sem 'unsafe-eval' em produção", () => {
  const scriptSrc = buildCsp("click-redirect", generateNonce(), false)
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src"))!;
  assert.equal(scriptSrc.includes("'unsafe-inline'"), false);
  assert.equal(scriptSrc.includes("'unsafe-eval'"), false);
});
