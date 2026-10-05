import assert from "node:assert/strict";
import { test } from "node:test";
import { customLinkOrigin, textoDoProblema, toDominioView } from "./view";

test("visão do domínio traz o estado e os dois registros, sem campos internos", () => {
  const view = toDominioView({
    tenantId: "loja-a",
    hostname: "links.loja.com.br",
    verificationToken: "tok",
    status: "pending",
    lastError: "txt",
    checkedAt: "2026-10-04T12:00:00.000Z",
    verifiedAt: null,
  });
  assert.deepEqual(view, {
    hostname: "links.loja.com.br",
    status: "pending",
    problema: "txt",
    verificadoEm: null,
    registros: [
      { tipo: "CNAME", nome: "links.loja.com.br", valor: "cname.vercel-dns.com" },
      { tipo: "TXT", nome: "_girumo-verify.links.loja.com.br", valor: "girumo-verify=tok" },
    ],
  });
  assert.equal("tenantId" in view, false);
});

test("problema vira frase para o lojista; código desconhecido não", () => {
  assert.match(textoDoProblema("txt") ?? "", /TXT/);
  assert.match(textoDoProblema("dns") ?? "", /CNAME/);
  assert.equal(textoDoProblema(null), null);
  assert.equal(textoDoProblema("toString"), null);
  assert.equal(textoDoProblema("qualquer"), null);
});

test("origem dos links só com domínio ativo", () => {
  assert.equal(customLinkOrigin({ dominio: { hostname: "links.loja.com.br", status: "active" } }), "https://links.loja.com.br");
  assert.equal(customLinkOrigin({ dominio: { hostname: "links.loja.com.br", status: "pending" } }), null);
  assert.equal(customLinkOrigin({ habilitado: false, dominio: null }), null);
  assert.equal(customLinkOrigin(null), null);
});
