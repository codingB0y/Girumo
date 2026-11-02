import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
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
  assert.equal(surfaceForPath("/c/abc123"), "click-redirect");
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
  for (const surface of ["public-lp", "click-redirect", "bio", "rastreio"] as const) {
    const scriptSrc = buildCsp(surface, generateNonce(), false)
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), `${surface} ainda tem unsafe-inline`);
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), `${surface} ainda tem unsafe-eval`);
  }
});

test("unsafe-eval comes back only in dev, where Turbopack needs it", () => {
  for (const surface of ["public-lp", "click-redirect", "bio", "rastreio"] as const) {
    const dev = buildCsp(surface, generateNonce(), true);
    assert.ok(dev.includes("'unsafe-eval'"), `${surface} sem unsafe-eval em dev`);
    assert.ok(!dev.includes("'unsafe-inline' 'nonce-"), `${surface} com unsafe-inline junto do nonce`);
  }
});

test("public LP keeps the vendors the tracking session injects", () => {
  const csp = buildCsp("public-lp", generateNonce(), false);
  assert.ok(csp.includes("https://connect.facebook.net/en_US/fbevents.js"));
  assert.ok(csp.includes("https://www.googletagmanager.com/gtag/"));
  // A foto do lojista vem de URL https arbitrária.
  assert.ok(csp.includes("img-src 'self' data: https:"));
  // O destino nunca é embutido: frame só dos provedores de vídeo do depoimento.
  assert.ok(csp.includes("frame-src https://www.youtube-nocookie.com https://player.vimeo.com"));
});

test("script-src não libera host inteiro da Meta nem do Google (gtm.js de terceiro entraria sem nonce)", () => {
  for (const surface of ["public-lp", "click-redirect", "bio"] as const) {
    const sources = (buildCsp(surface, generateNonce(), false)
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src")) ?? "")
      .split(" ");
    const dosRastreadores = sources.filter(
      (s) => s.startsWith("https://connect.facebook.net") || s.startsWith("https://www.googletagmanager.com"),
    );
    assert.equal(dosRastreadores.length, 3, `${surface}: ${dosRastreadores.join(" ")}`);
    for (const source of dosRastreadores) {
      assert.ok(new URL(source).pathname.length > 1, `${surface} libera o host solto ${source}`);
    }
  }
});

test("'strict-dynamic' fecha /bio, /r/, /c/ e /p/: o gtag/js?id=GTM- serve o contêiner inteiro e passaria pelo caminho", () => {
  const scriptSrc = (surface: "public-lp" | "click-redirect" | "bio", isDev = false) =>
    buildCsp(surface, "AAAAAAAAAAAAAAAAAAAAAA==", isDev)
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
  for (const surface of ["bio", "click-redirect", "public-lp"] as const) {
    for (const isDev of [false, true]) {
      assert.ok(
        scriptSrc(surface, isDev).startsWith("script-src 'self' 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'strict-dynamic' "),
        `${surface} (dev=${isDev}) sem 'strict-dynamic' logo depois do nonce`,
      );
    }
  }
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
  // A allowlist de script é FECHADA: só os arquivos de tag que carregamos entram.
  // Source novo aqui tem de ser uma decisão consciente, não um efeito colateral.
  const hostsDeScript = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "")
    .split(" ")
    .filter((t) => t.startsWith("https://"));
  assert.deepEqual(hostsDeScript.sort(), [
    "https://connect.facebook.net/en_US/fbevents.js",
    "https://connect.facebook.net/signals/",
    "https://www.googletagmanager.com/gtag/",
  ]);
});

test("click-redirect libera o gtag: script, img e connect do Google", () => {
  const csp = buildCsp("click-redirect", generateNonce(), false);
  const dir = (nome: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(nome)) ?? "";
  assert.match(dir("script-src"), /https:\/\/www\.googletagmanager\.com\/gtag\//);
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

test("o link da bio é superfície com nonce própria; prefixo parecido não entra", () => {
  assert.equal(surfaceForPath("/bio/loja-teste"), "bio");
  assert.equal(surfaceForPath("/bio"), "bio");
  for (const path of ["/biografia", "/bio-loja", "/api/p/bio/toque"]) {
    assert.equal(surfaceForPath(path), null, path);
  }
});

test("CSP do link da bio: o nonce e só os hosts da Meta e do GA, fixos (spec link-da-bio §6, PR 7)", () => {
  const nonce = generateNonce();
  const csp = buildCsp("bio", nonce, false);
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://connect.facebook.net/en_US/fbevents.js https://connect.facebook.net/signals/ https://www.googletagmanager.com/gtag/`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com",
    "font-src 'self'",
    "connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]);
  assert.equal(nonceSeenByNext(csp), nonce);
});

const NEXT_CONFIG = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
const MIDDLEWARE = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");

/**
 * A regra que entrega a CSP ESTÁTICA a tudo que não tem nonce, lida do next.config
 * (que importa @sentry/nextjs e não roda sob tsx) e casada com o matcher do próprio Next.
 */
function regraGlobal(): (caminho: string) => boolean {
  const fonte = NEXT_CONFIG.match(/source:\s*"([^"]+)",\s*headers:\s*securityHeaders/)?.[1];
  assert.ok(fonte, "regra global de headers não encontrada no next.config.ts");
  const casa = getPathMatch(fonte, { strict: true, removeUnnamedParams: true });
  return (caminho) => casa(caminho) !== false;
}

test("a CSP estática do next.config não casa o link da bio (na Vercel sairiam duas CSP)", () => {
  const casa = regraGlobal();
  for (const caminho of ["/bio", "/bio/loja-teste", "/p/x", "/r/x", "/c/x"]) {
    assert.equal(casa(caminho), false, `${caminho} sairia com duas CSP`);
  }
  for (const caminho of ["/painel", "/termos", "/biografia", "/login"]) {
    assert.equal(casa(caminho), true, `${caminho} ficou sem a CSP estática`);
  }
  assert.match(NEXT_CONFIG, /source:\s*"\/bio\/:path\*",\s*headers:\s*headersWithoutCsp/);
});

test("a raiz se divide pelo host: CSP estática no Girumo, a do middleware no domínio do lojista", () => {
  assert.equal(regraGlobal()("/"), false, "a raiz casou a regra global: no domínio do lojista sairiam duas CSP");
  assert.match(NEXT_CONFIG, /source:\s*"\/",\s*has:\s*\[\{\s*type:\s*"host",\s*value:\s*FIRST_PARTY_HOST_PATTERN\s*\}\],\s*headers:\s*securityHeaders/);
  assert.match(NEXT_CONFIG, /source:\s*"\/",\s*missing:\s*\[\{\s*type:\s*"host",\s*value:\s*FIRST_PARTY_HOST_PATTERN\s*\}\],\s*headers:\s*headersWithoutCsp/);
});

test("o middleware roda em toda /bio/* (entrada própria no matcher, como /p/ /r/ /c/)", () => {
  assert.match(MIDDLEWARE, /"\/bio\/:path\*"/);
});

test("a fonte do link da bio tem cache de 30 dias, sem immutable (o nome não tem versão)", () => {
  const bloco = /source:\s*"\/fonts\/bio\/:path\*",\s*headers:\s*\[([\s\S]*?)\],\s*\}/.exec(NEXT_CONFIG)?.[1] ?? "";
  assert.match(bloco, /key:\s*"Cache-Control",\s*value:\s*"public, max-age=2592000"\s*\}/);
  // A prévia (iframe srcdoc sandbox="") tem origem opaca: a fonte é pedida com `Origin: null`.
  assert.match(bloco, /key:\s*"Access-Control-Allow-Origin",\s*value:\s*"\*"\s*\}/);
  assert.doesNotMatch(NEXT_CONFIG, /fonts\/bio[\s\S]{0,200}immutable/);
});

const CAMINHOS = ["/rastreio", "/rastreio/loja-exemplo", "/rastreio/loja-exemplo/0123456789abcdef0123456789abcdef/parar"];

test("rastreio: superfície com nonce própria; prefixo parecido não entra", () => {
  for (const p of CAMINHOS) assert.equal(surfaceForPath(p), "rastreio", p);
  for (const p of ["/rastreios", "/rastreio-x", "/api/rastreio/config"]) assert.equal(surfaceForPath(p), null, p);
});

test("CSP do rastreio: só o nonce, nenhum terceiro, formulário só para a mesma origem", () => {
  const nonce = generateNonce();
  const csp = buildCsp("rastreio", nonce, false);
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]);
  assert.equal(nonceSeenByNext(csp), nonce);
});

test("o rastreio sai da CSP estática, roda no middleware e fica só no www", () => {
  const casa = regraGlobal();
  for (const p of CAMINHOS) assert.equal(casa(p), false, `${p} sairia com duas CSP`);
  assert.equal(casa("/rastreios"), true);
  assert.match(NEXT_CONFIG, /source:\s*"\/rastreio\/:path\*",\s*headers:\s*headersWithoutCsp/);
  assert.match(NEXT_CONFIG, /\.\.\.rastreioDomainRedirects\(\)/);
  assert.match(MIDDLEWARE, /"\/rastreio\/:path\*"/);
});
