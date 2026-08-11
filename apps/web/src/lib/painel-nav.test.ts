import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { NAV_ALL, NAV_FOOTER, NAV_GROUPS, NAV_MOBILE_PRIMARY, isNavItemActive } from "./painel-nav";

const APP_DIR = path.join(process.cwd(), "src", "app");

/** `/painel/automacoes` → `src/app/painel/automacoes/page.tsx` */
function routeFileFor(href: string): string {
  return path.join(APP_DIR, ...href.split("/").filter(Boolean), "page.tsx");
}

test("every navigation destination is a route that exists", () => {
  // Guarda contra links mortos como /painel/ds, que a palette apontava.
  for (const item of NAV_ALL) {
    assert.ok(
      existsSync(routeFileFor(item.href)),
      `${item.label} aponta para ${item.href}, que não tem page.tsx`,
    );
  }
});

test("keeps Automações and Indicação reachable", () => {
  // Os dois módulos existiam sem nenhum link em toda a aplicação.
  const hrefs = NAV_ALL.map((i) => i.href);
  assert.ok(hrefs.includes("/painel/automacoes"));
  assert.ok(hrefs.includes("/painel/indicacao"));
});

test("exposes Disparos — sem item de menu, a única porta pro envio era achar a aba dentro de uma campanha", () => {
  assert.ok(NAV_ALL.map((i) => i.href).includes("/painel/disparos"));
});

test("does not expose internal or redirect-only routes", () => {
  const hrefs = NAV_ALL.map((i) => i.href);
  for (const hidden of [
    "/painel/dev-tools", // ferramenta interna
    "/painel/ds", // não existe
    // /painel/disparos saiu desta lista: deixou de ser redirect e virou tela
    // própria de disparo, então AGORA precisa estar no menu (teste abaixo).
    "/painel/agenda",
    "/painel/biblioteca",
  ]) {
    assert.ok(!hrefs.includes(hidden), `${hidden} não deveria estar no menu`);
  }
});

test("has no duplicate destinations", () => {
  const hrefs = NAV_ALL.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("mobile bottom bar only points at destinations present in the full menu", () => {
  const hrefs = new Set(NAV_ALL.map((i) => i.href));
  for (const item of NAV_MOBILE_PRIMARY) {
    assert.ok(hrefs.has(item.href), `${item.label} sumiu do menu completo`);
  }
});

test("flattens groups and footer into NAV_ALL", () => {
  const expected = NAV_GROUPS.flatMap((g) => g.items).length + NAV_FOOTER.length;
  assert.equal(NAV_ALL.length, expected);
});

test("marks only the exact home route active, and any nested route otherwise", () => {
  assert.equal(isNavItemActive("/painel", "/painel"), true);
  assert.equal(isNavItemActive("/painel/campanhas", "/painel"), false);
  assert.equal(isNavItemActive("/painel/campanhas/nova", "/painel/campanhas"), true);
});
