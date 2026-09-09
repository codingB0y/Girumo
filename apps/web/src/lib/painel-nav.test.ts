import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  NAV_ALL,
  NAV_BARRA_DIREITA,
  NAV_BARRA_ESQUERDA,
  NAV_FOOTER,
  NAV_GROUPS,
  NAV_GRUPOS_ORDEM,
  NAV_MOBILE_PRIMARY,
  isNavItemActive,
  resumo,
} from "./painel-nav";

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

// --- Vitrine Aberta (spec 2026-09-07): grupos do corredor, barra de 5 e resumo ---

test("todo item de navegação pertence a um dos três grupos do corredor", () => {
  for (const item of NAV_ALL) {
    assert.ok(NAV_GRUPOS_ORDEM.includes(item.grupo), `${item.href} sem grupo válido`);
  }
});

test("a barra da Vitrine só aponta pra rotas que existem na navegação", () => {
  const hrefs = new Set(NAV_ALL.map((i) => i.href));
  for (const item of [...NAV_BARRA_ESQUERDA, ...NAV_BARRA_DIREITA]) {
    assert.ok(hrefs.has(item.href), `${item.href} fora de NAV_ALL`);
  }
  assert.equal(NAV_BARRA_ESQUERDA.length + NAV_BARRA_DIREITA.length, 3, "Postar e Mais completam os cinco");
});

test("resumo com dados mostra o estado de cada módulo", () => {
  const ultimo = new Date(2026, 8, 2, 12, 12).toISOString();
  const linhas = resumo({
    campanhas: 3,
    ultimoDisparo: ultimo,
    relampagoAoVivo: true,
    automacoes: { ligadas: 0, total: 3 },
    paginasNoAr: 2,
  });
  assert.deepEqual(linhas, {
    "/painel/campanhas": "Campanhas · 3",
    "/painel/disparos": "Disparos · último 02/09 12:12",
    "/painel/relampago": "Oferta Relâmpago · ao vivo",
    "/painel/automacoes": "Automações · 0 de 3 ligadas",
    "/painel/pages": "Páginas · 2 no ar",
  });
});

test("resumo vazio diz que não há nada, nunca zero", () => {
  const linhas = resumo({
    campanhas: 0,
    ultimoDisparo: null,
    relampagoAoVivo: false,
    automacoes: { ligadas: 0, total: 0 },
    paginasNoAr: 0,
  });
  assert.equal(linhas["/painel/campanhas"], "Campanhas · nenhuma");
  assert.equal(linhas["/painel/disparos"], "Disparos · nenhum ainda");
  assert.equal(linhas["/painel/relampago"], "Oferta Relâmpago · nenhuma aberta");
  assert.equal(linhas["/painel/automacoes"], "Automações · nenhuma");
  assert.equal(linhas["/painel/pages"], "Páginas · nenhuma no ar");
  assert.ok(!Object.values(linhas).some((l) => /\b0\b/.test(l)));
});
