import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { Link2 } from "lucide-react";
import type { Acesso } from "@/lib/auth/modulos";
import {
  NAV_ALL,
  NAV_BARRA_DESKTOP,
  NAV_BARRA_DIREITA,
  NAV_BARRA_ESQUERDA,
  NAV_FOOTER,
  NAV_GROUPS,
  NAV_GRUPOS_ORDEM,
  NAV_MOBILE_PRIMARY,
  destinoDaPagina,
  isNavItemActive,
  itensDaBarra,
  liberado,
  podePostar,
  resumo,
  visivelNoMenu,
  type NavItem,
} from "./painel-nav";

test("a barra de cima só aponta pra destinos do menu completo, no máximo seis, e o Relâmpago tem nome curto", () => {
  for (const item of NAV_BARRA_DESKTOP) assert.ok(NAV_ALL.includes(item), `${item.href} fora do menu`);
  assert.ok(NAV_BARRA_DESKTOP.length <= 6);
  assert.deepEqual(NAV_BARRA_DESKTOP.map((i) => i.href), ["/painel", "/painel/campanhas", "/painel/disparos", "/painel/relampago", "/painel/grupos", "/painel/contatos"]);
  assert.equal(NAV_BARRA_DESKTOP.find((i) => i.href === "/painel/relampago")?.curto, "Relâmpago");
});

const APP_DIR = path.join(process.cwd(), "src", "app");

/** `/painel/funis` → `src/app/painel/funis/page.tsx` */
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

test("Funis entrou no lugar de Automações", () => {
  const hrefs = NAV_ALL.map((i) => i.href);
  assert.ok(hrefs.includes("/painel/funis"));
  assert.ok(!hrefs.includes("/painel/automacoes"));
});

test("exposes Disparos — sem item de menu, a única porta pro envio era achar a aba dentro de uma campanha", () => {
  assert.ok(NAV_ALL.map((i) => i.href).includes("/painel/disparos"));
});

test("exposes Biblioteca — virou aba própria com pastas por tenant, deixou de ser redirect", () => {
  assert.ok(NAV_ALL.map((i) => i.href).includes("/painel/biblioteca"));
});

test("does not expose internal or redirect-only routes", () => {
  const hrefs = NAV_ALL.map((i) => i.href);
  for (const hidden of [
    "/painel/dev-tools", // ferramenta interna
    "/painel/ds", // não existe
    // /painel/disparos e /painel/biblioteca saíram desta lista: deixaram de
    // ser redirect e viraram tela própria, então AGORA precisam estar no
    // menu (testes acima).
    "/painel/agenda",
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

// --- Vitrine Aberta (spec 2026-09-07): grupos do Mais, barra de 5 e resumo ---

test("todo item de navegação pertence a um dos três grupos do Mais", () => {
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
    funisAgendados: 2,
    paginasNoAr: 2,
  });
  assert.deepEqual(linhas, {
    "/painel/campanhas": "Campanhas · 3",
    "/painel/disparos": "Disparos · último 02/09 12:12",
    "/painel/relampago": "Oferta Relâmpago · ao vivo",
    "/painel/funis": "Funis · 2 agendados",
    "/painel/pages": "Páginas · 2 no ar",
  });
});

test("resumo vazio diz que não há nada, nunca zero", () => {
  const linhas = resumo({
    campanhas: 0,
    ultimoDisparo: null,
    relampagoAoVivo: false,
    funisAgendados: 0,
    paginasNoAr: 0,
  });
  assert.equal(linhas["/painel/campanhas"], "Campanhas · nenhuma");
  assert.equal(linhas["/painel/disparos"], "Disparos · nenhum ainda");
  assert.equal(linhas["/painel/relampago"], "Oferta Relâmpago · nenhuma aberta");
  assert.equal(linhas["/painel/funis"], "Funis · nenhum agendado");
  assert.equal(linhas["/painel/pages"], "Páginas · nenhuma no ar");
  assert.ok(!Object.values(linhas).some((l) => /\b0\b/.test(l)));
});

test("Instagram fica em Lotar, logo depois de Campanhas, e só aparece com a liberação", () => {
  const lotar = NAV_ALL.filter((i) => i.grupo === "lotar").map((i) => i.href);
  assert.equal(lotar.indexOf("/painel/instagram"), lotar.indexOf("/painel/campanhas") + 1);
  const instagram = NAV_ALL.find((i) => i.href === "/painel/instagram") as NavItem;
  assert.equal(instagram.requer, "instagram");
  assert.equal(liberado(instagram, null), false, "sem resposta ainda, esconde em vez de piscar");
  assert.equal(liberado(instagram, { instagram: false, rastreio: false }), false);
  assert.equal(liberado(instagram, { instagram: true, rastreio: false }), true);
  const campanhas = NAV_ALL.find((i) => i.href === "/painel/campanhas") as NavItem;
  assert.equal(liberado(campanhas, null), true, "item sem liberação aparece sempre");
});

// --- Acesso da vendedora (spec 2026-10-07 §1, "Página") ---

const DONO: Acesso = { role: "owner", modules: [] };
const OPERADOR: Acesso = { role: "operator", modules: [] };
const VENDEDORA: Acesso = { role: "seller", modules: [] };
const VENDEDORA_POSTA: Acesso = { role: "seller", modules: ["postar"] };
const COM_INSTAGRAM = { instagram: true, rastreio: false };

const item = (href: string) => NAV_ALL.find((i) => i.href === href) as NavItem;
const visiveis = (acesso: Acesso | null) =>
  NAV_ALL.filter((i) => visivelNoMenu(i, acesso, COM_INSTAGRAM)).map((i) => i.href);

test("Vendas é item do módulo vendas, em Vender; Disparos é do módulo postar; a barra do dono não muda", () => {
  assert.equal(item("/painel/vendas").modulo, "vendas");
  assert.equal(item("/painel/vendas").grupo, "vender");
  assert.equal(item("/painel/disparos").modulo, "postar");
  assert.ok(!NAV_BARRA_DESKTOP.some((i) => i.href === "/painel/vendas"));
});

test("dono e operador veem o menu de antes, sem Vendas", () => {
  for (const acesso of [DONO, OPERADOR]) {
    assert.ok(!visiveis(acesso).includes("/painel/vendas"));
    assert.deepEqual(visiveis(acesso), NAV_ALL.filter((i) => i.href !== "/painel/vendas").map((i) => i.href));
    assert.equal(visivelNoMenu(item("/painel/instagram"), acesso, { instagram: false, rastreio: false }), false);
  }
});

test("a vendedora só vê os itens dos módulos dela, Vendas primeiro", () => {
  assert.deepEqual(visiveis(VENDEDORA), ["/painel/vendas"]);
  assert.deepEqual(visiveis(VENDEDORA_POSTA), ["/painel/vendas", "/painel/disparos"]);
});

test("sem acesso conhecido, nada que dependa de módulo aparece", () => {
  assert.equal(visivelNoMenu(item("/painel/vendas"), null, COM_INSTAGRAM), false);
  assert.equal(visivelNoMenu(item("/painel/disparos"), null, COM_INSTAGRAM), false);
  assert.equal(visivelNoMenu(item("/painel/grupos"), null, COM_INSTAGRAM), true);
  assert.equal(visivelNoMenu(item("/painel/instagram"), null, null), false);
});

test("Postar segue Disparos", () => {
  assert.equal(podePostar(DONO), true);
  assert.equal(podePostar(OPERADOR), true);
  assert.equal(podePostar(VENDEDORA), false);
  assert.equal(podePostar(VENDEDORA_POSTA), true);
  assert.equal(podePostar(null), false);
});

test("barra de cima: o dono vê os seis do dia; a vendedora, só o que é dela", () => {
  assert.deepEqual(itensDaBarra(DONO, COM_INSTAGRAM).map((i) => i.href), NAV_BARRA_DESKTOP.map((i) => i.href));
  assert.deepEqual(itensDaBarra(VENDEDORA, null).map((i) => i.href), ["/painel/vendas"]);
  assert.deepEqual(itensDaBarra(VENDEDORA_POSTA, null).map((i) => i.href), ["/painel/vendas", "/painel/disparos"]);
});

test("guarda: a Início da vendedora é Vendas; fora do acesso, bloqueio; outros papéis passam", () => {
  assert.equal(destinoDaPagina(VENDEDORA, "/painel"), "ir-para-vendas");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/vendas"), "mostrar");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/contatos"), "bloquear");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/configuracoes"), "bloquear");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/disparos"), "bloquear");
  assert.equal(destinoDaPagina(VENDEDORA_POSTA, "/painel/disparos"), "mostrar");
  assert.equal(destinoDaPagina(DONO, "/painel"), "mostrar");
  assert.equal(destinoDaPagina(DONO, "/painel/contatos"), "mostrar");
  assert.equal(destinoDaPagina(null, "/painel/contatos"), "mostrar");
});

// Papel desconhecido (ex.: /api/auth/me devolveu algo fora dos quatro): fechado, como em modulos.ts.
const DESCONHECIDO = { role: "gerente", modules: [] } as unknown as Acesso;

test("papel desconhecido: menu vazio, sem Postar, e a guarda bloqueia", () => {
  assert.deepEqual(visiveis(DESCONHECIDO), []);
  assert.equal(podePostar(DESCONHECIDO), false);
  assert.equal(destinoDaPagina(DESCONHECIDO, "/painel"), "bloquear");
  assert.equal(destinoDaPagina(DESCONHECIDO, "/painel/vendas"), "bloquear");
  assert.deepEqual(itensDaBarra(DESCONHECIDO, COM_INSTAGRAM), []);
});

test("sem acesso conhecido, a barra de cima não traz o que depende de módulo", () => {
  const hrefs = itensDaBarra(null, COM_INSTAGRAM).map((i) => i.href);
  assert.ok(!hrefs.includes("/painel/disparos"));
  assert.ok(!hrefs.includes("/painel/vendas"));
  assert.deepEqual(hrefs, NAV_BARRA_DESKTOP.filter((i) => i.modulo === undefined).map((i) => i.href));
});

test("Link da bio fica em Lotar logo depois de Páginas, fora das barras, e a vendedora não vê", () => {
  const lotar = NAV_ALL.filter((i) => i.grupo === "lotar").map((i) => i.href);
  assert.equal(lotar.indexOf("/painel/link-da-bio"), lotar.indexOf("/painel/pages") + 1);
  const bio = item("/painel/link-da-bio");
  assert.equal(bio.label, "Link da bio");
  assert.equal(bio.icon, Link2);
  assert.equal(bio.modulo, undefined);
  for (const barra of [NAV_BARRA_DESKTOP, NAV_BARRA_ESQUERDA, NAV_BARRA_DIREITA, NAV_MOBILE_PRIMARY]) {
    assert.ok(!barra.some((i) => i.href === "/painel/link-da-bio"));
  }
  assert.ok(visiveis(DONO).includes("/painel/link-da-bio"));
  assert.ok(visiveis(OPERADOR).includes("/painel/link-da-bio"));
  assert.ok(!visiveis(VENDEDORA_POSTA).includes("/painel/link-da-bio"));
});

test("item com permissao: só papel que a tem, e só com a liberação ligada", () => {
  const entregas: NavItem = { href: "/x", label: "X", icon: Link2, grupo: "vender", requer: "rastreio", permissao: "settings:connection" };
  const ligado = { instagram: false, rastreio: true };
  const admin: Acesso = { role: "admin", modules: [] };
  assert.equal(visivelNoMenu(entregas, DONO, ligado), true);
  assert.equal(visivelNoMenu(entregas, admin, ligado), true);
  assert.equal(visivelNoMenu(entregas, DONO, { instagram: false, rastreio: false }), false);
  assert.equal(visivelNoMenu(entregas, OPERADOR, ligado), false);
  assert.equal(visivelNoMenu(entregas, VENDEDORA, ligado), false);
  assert.equal(visivelNoMenu(entregas, VENDEDORA_POSTA, ligado), false);
  assert.equal(visivelNoMenu(entregas, null, ligado), false);
  assert.equal(visivelNoMenu(entregas, DONO, null), false);
});
