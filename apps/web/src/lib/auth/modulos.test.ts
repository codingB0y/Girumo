import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantRole } from "@/lib/permissions";
import {
  MENSAGEM_BLOQUEIO,
  MODULOS_OPCIONAIS,
  ROTAS,
  modulosDoAcesso,
  paginaLiberada,
  parseModulos,
  podeAcessar,
  type Acesso,
} from "./modulos";

const SO_VENDAS: Acesso = { role: "seller", modules: [] };
const COM_POSTAR: Acesso = { role: "seller", modules: ["postar"] };

/** [método, caminho, vendedora só com vendas, vendedora com postar] */
const TABELA: ReadonlyArray<readonly [string, string, boolean, boolean]> = [
  // base
  ["GET", "/api/auth/me", true, true],
  ["POST", "/api/auth/me", false, false],
  // vendas: sempre ligado para a vendedora
  ["GET", "/api/vendas", true, true],
  ["POST", "/api/vendas", true, true],
  ["GET", "/api/vendas/contato", true, true],
  ["PATCH", "/api/vendas/0b6c1d2e-7f80-4a1b-9c3d-5e6f7a8b9c0d", true, true],
  ["DELETE", "/api/vendas/0b6c1d2e-7f80-4a1b-9c3d-5e6f7a8b9c0d", true, true],
  // método errado
  ["DELETE", "/api/vendas", false, false],
  ["GET", "/api/vendas/0b6c1d2e-7f80-4a1b-9c3d-5e6f7a8b9c0d", false, false],
  ["PUT", "/api/vendas", false, false],
  ["HEAD", "/api/auth/me", false, false],
  // `*` é exatamente um segmento
  ["PATCH", "/api/vendas/a/b", false, false],
  ["GET", "/api/vendas/contato/extra", false, false],
  // barra no fim normaliza; barra dupla, caixa e prefixo parecido não passam
  ["GET", "/api/vendas/", true, true],
  ["GET", "/api/auth/me/", true, true],
  ["GET", "/api//vendas", false, false],
  ["GET", "/API/vendas", false, false],
  ["GET", "/api/vendasx", false, false],
  ["GET", "/api", false, false],
  ["GET", "/", false, false],
  // fechado por padrão: nada de dot segment, escape, query, caminho sem "/" inicial ou barra dupla no fim
  ["POST", "/api/campanhas/../messages", false, false],
  ["POST", "/api/campanhas/./messages", false, false],
  ["POST", "/api/campanhas/%2e%2e/messages", false, false],
  ["POST", "/api/campanhas/x?/messages", false, false],
  ["POST", "/api/campanhas/x#/messages", false, false],
  ["POST", "/api/campanhas/x%2Fy/messages", false, false],
  ["POST", "/api/campanhas/x\\y/messages", false, false],
  ["PATCH", "/api/vendas/..", false, false],
  ["PATCH", "/api/vendas/.", false, false],
  ["GET", "x/api/vendas", false, false],
  ["GET", "api/vendas", false, false],
  ["GET", "", false, false],
  ["GET", "/api/vendas//", false, false],
  // postar
  ["GET", "/api/campanhas", false, true],
  ["GET", "/api/groups", false, true],
  ["GET", "/api/disparos", false, true],
  ["GET", "/api/session", false, true],
  ["GET", "/api/library", false, true],
  ["POST", "/api/campanhas/promo-de-verao/messages", false, true],
  ["POST", "/api/media/prepare", false, true],
  ["POST", "/api/media/register", false, true],
  // postar não edita: criar/editar/apagar campanha, cancelar oferta, mexer no número
  ["POST", "/api/campanhas", false, false],
  ["PATCH", "/api/campanhas", false, false],
  ["DELETE", "/api/campanhas/promo-de-verao/messages", false, false],
  ["GET", "/api/campanhas/promo-de-verao/messages", false, false],
  ["POST", "/api/campanhas/promo-de-verao/messages/cancel", false, false],
  ["POST", "/api/groups", false, false],
  ["POST", "/api/session", false, false],
  ["GET", "/api/media", false, false],
  // fora do mapa
  ["GET", "/api/orders", false, false],
  ["GET", "/api/contatos", false, false],
  ["GET", "/api/members", false, false],
  ["GET", "/api/notifications", false, false],
  ["GET", "/api/subscription", false, false],
];

test("vendedora: rota × método × módulo", () => {
  for (const [metodo, caminho, soVendas, comPostar] of TABELA) {
    assert.equal(podeAcessar(SO_VENDAS, caminho, metodo), soVendas, `${metodo} ${caminho} (só vendas)`);
    assert.equal(podeAcessar(COM_POSTAR, caminho, metodo), comPostar, `${metodo} ${caminho} (com postar)`);
  }
});

test("módulo desconhecido em modules nega em vez de estourar", () => {
  for (const lixo of ["constructor", "__proto__", "toString", "vendas", "POSTAR"]) {
    const acesso = { role: "seller", modules: [lixo] } as unknown as Acesso;
    assert.equal(podeAcessar(acesso, "/api/vendas", "GET"), true, lixo);
    assert.equal(podeAcessar(acesso, "/api/campanhas", "GET"), false, lixo);
    assert.equal(paginaLiberada(acesso, "/painel/disparos"), false, lixo);
  }
  assert.deepEqual(modulosDoAcesso({ role: "seller", modules: ["constructor"] } as unknown as Acesso), ["vendas"]);
});

test("o método chega em qualquer caixa", () => {
  assert.equal(podeAcessar(SO_VENDAS, "/api/vendas", "post"), true);
  assert.equal(podeAcessar(COM_POSTAR, "/api/campanhas", "get"), true);
});

test("toda rota do mapa abre para quem tem o módulo dela", () => {
  const tudo: Acesso = { role: "seller", modules: [...MODULOS_OPCIONAIS] };
  for (const rotas of Object.values(ROTAS)) {
    for (const { padrao, metodos } of rotas) {
      const caminho = padrao.replaceAll("*", "qualquer-id");
      for (const metodo of metodos) assert.equal(podeAcessar(tudo, caminho, metodo), true, `${metodo} ${caminho}`);
    }
  }
});

test("dono, admin e operador passam em tudo, com qualquer módulo", () => {
  for (const role of ["owner", "admin", "operator"] as TenantRole[]) {
    for (const [metodo, caminho] of TABELA) {
      assert.equal(podeAcessar({ role, modules: [] }, caminho, metodo), true, `${role} ${metodo} ${caminho}`);
    }
    assert.equal(paginaLiberada({ role, modules: [] }, "/painel/configuracoes"), true, role);
    assert.equal(paginaLiberada({ role, modules: [] }, "/painel"), true, role);
  }
});

test("papel nulo ou desconhecido é negado (fecha por padrão)", () => {
  for (const role of [null, undefined, "viewer", ""]) {
    const acesso = { role, modules: [] } as unknown as Acesso;
    assert.equal(podeAcessar(acesso, "/api/orders", "GET"), false, String(role));
    assert.equal(podeAcessar(acesso, "/api/vendas", "GET"), false, String(role));
    assert.equal(paginaLiberada(acesso, "/painel"), false, String(role));
    assert.equal(paginaLiberada(acesso, "/painel/vendas"), false, String(role));
  }
});

test("páginas: vendas sempre, postar só liberado, por prefixo de segmento", () => {
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendas"), true);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendas/"), true);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendas/qualquer"), true);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/vendasx"), false);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel"), false);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/contatos"), false);
  assert.equal(paginaLiberada(SO_VENDAS, "/painel/disparos"), false);
  assert.equal(paginaLiberada(COM_POSTAR, "/painel/disparos"), true);
  assert.equal(paginaLiberada(COM_POSTAR, "/painel/campanhas"), false);
  // dot segment, escape, caminho sem "/" inicial e barra dupla não passam
  for (const caminho of [
    "/painel/vendas/../contatos",
    "/painel/vendas/./x",
    "/painel/vendas/%2e%2e/contatos",
    "/painel/vendas//x",
    "x/painel/vendas",
    "painel/vendas",
    "",
  ]) {
    assert.equal(paginaLiberada(SO_VENDAS, caminho), false, caminho);
    assert.equal(paginaLiberada(COM_POSTAR, caminho), false, caminho);
  }
});

test("modulosDoAcesso: vendas implícito para a vendedora, nada para os outros", () => {
  assert.deepEqual(modulosDoAcesso(SO_VENDAS), ["vendas"]);
  assert.deepEqual(modulosDoAcesso(COM_POSTAR), ["vendas", "postar"]);
  assert.deepEqual(modulosDoAcesso({ role: "owner", modules: [] }), []);
});

test("parseModulos fica só com os opcionais conhecidos, sem repetir; lixo vira []", () => {
  assert.deepEqual(parseModulos(["postar"]), ["postar"]);
  assert.deepEqual(parseModulos(["postar", "postar"]), ["postar"]);
  assert.deepEqual(parseModulos(["postar", "xpto", 1, null]), ["postar"]);
  // `vendas` é implícito e nunca vem do banco; se vier, não vira opcional.
  assert.deepEqual(parseModulos(["vendas"]), []);
  assert.deepEqual(parseModulos(["POSTAR"]), []);
  for (const lixo of [null, undefined, "postar", "{postar}", {}, 42]) {
    assert.deepEqual(parseModulos(lixo), [], JSON.stringify(lixo) ?? "undefined");
  }
});

test("o mapa só tem padrão de /api sem barra no fim e método em maiúsculas", () => {
  for (const rotas of Object.values(ROTAS)) {
    for (const { padrao, metodos } of rotas) {
      assert.match(padrao, /^\/api(\/[^/]+)+$/, padrao);
      for (const metodo of metodos) assert.equal(metodo, metodo.toUpperCase(), `${padrao} ${metodo}`);
    }
  }
});

test("a mensagem de bloqueio é a do contrato", () => {
  assert.equal(MENSAGEM_BLOQUEIO, "Área não liberada para o seu acesso.");
});
