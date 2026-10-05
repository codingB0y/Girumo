import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FIRST_MATCHER_SKIPPED,
  FIRST_PARTY_HOST_PATTERN,
  customHostRoute,
  hostnameFromHostHeader,
  isFirstPartyHost,
  skipsFirstPartyMiddleware,
} from "./host";

const MIDDLEWARE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "middleware.ts");

test("hosts do Girumo, previews e dev local são first-party", () => {
  for (const host of [
    "girumo.com.br",
    "app.girumo.com.br",
    "www.girumo.com.br",
    "app.hubflow.com.br",
    "girumo-git-main-time.vercel.app",
    "localhost",
    "127.0.0.1",
    "192.168.0.10",
    "APP.GIRUMO.COM.BR",
  ]) {
    assert.equal(isFirstPartyHost(host), true, host);
  }
});

test("domínio de lojista e imitações não são first-party", () => {
  for (const host of [
    "links.sualoja.com.br",
    "evilgirumo.com.br",
    "girumo.com.br.evil.com",
    "app.girumo.com.br.sualoja.com",
    "vercel.app.evil.com",
    "",
  ]) {
    assert.equal(isFirstPartyHost(host), false, host);
  }
});

test("Host com porta e caixa vira o hostname que o Next compara", () => {
  assert.equal(hostnameFromHostHeader("Links.SuaLoja.com.br:443"), "links.sualoja.com.br");
  assert.equal(hostnameFromHostHeader("localhost:3000"), "localhost");
  assert.equal(hostnameFromHostHeader(null), "");
});

test("domínio de lojista serve só links, páginas e as APIs públicas delas", () => {
  assert.equal(customHostRoute("/r/vip"), "surface");
  assert.equal(customHostRoute("/c/comunidade"), "surface");
  assert.equal(customHostRoute("/p/minha-loja"), "surface");
  assert.equal(customHostRoute("/api/p/lead"), "public-api");
  assert.equal(customHostRoute("/api/p/media/123"), "public-api");
  for (const path of ["/", "/login", "/signup", "/painel", "/painel/campanhas", "/admin", "/api/dominio", "/api/auth/login", "/r", "/p", "/rr/x"]) {
    assert.equal(customHostRoute(path), "not-found", path);
  }
});

test("o matcher do middleware usa o mesmo padrão de host, no `missing`", () => {
  const fonte = readFileSync(MIDDLEWARE, "utf8");
  assert.ok(
    fonte.includes(`value: ${JSON.stringify(FIRST_PARTY_HOST_PATTERN)}`),
    "o literal do matcher saiu de sincronia com FIRST_PARTY_HOST_PATTERN",
  );
  assert.match(fonte, /missing:\s*\[\s*\{\s*type:\s*"host"/);
});

test("em host do Girumo, os caminhos que a primeira entrada do matcher exclui passam direto", () => {
  for (const path of ["/login", "/signup", "/forgot-password", "/reset-password/x", "/auth/callback", "/api/p/lead", "/lp", "/lp3"]) {
    assert.equal(skipsFirstPartyMiddleware(path), true, path);
  }
  for (const path of ["/", "/painel", "/p/x", "/r/x", "/c/x", "/api/dominio", "/termos"]) {
    assert.equal(skipsFirstPartyMiddleware(path), false, path);
  }
});

test("a primeira entrada do matcher usa a mesma lista de exclusões", () => {
  const fonte = readFileSync(MIDDLEWARE, "utf8");
  assert.ok(
    fonte.includes(`(?!${FIRST_MATCHER_SKIPPED}|`),
    "a lista de exclusões da primeira entrada do matcher saiu de sincronia com FIRST_MATCHER_SKIPPED",
  );
});
