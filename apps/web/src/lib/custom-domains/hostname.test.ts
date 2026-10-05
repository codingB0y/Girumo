import assert from "node:assert/strict";
import { test } from "node:test";
import { dnsRecordsFor, normalizeHostname } from "./hostname";

test("aceita subdomínio e limpa URL colada", () => {
  assert.deepEqual(normalizeHostname("links.sualoja.com.br"), { ok: true, hostname: "links.sualoja.com.br" });
  assert.deepEqual(normalizeHostname("  https://Links.SuaLoja.com.br/r/vip?utm=x "), { ok: true, hostname: "links.sualoja.com.br" });
  assert.deepEqual(normalizeHostname("grupos.loja.com."), { ok: true, hostname: "grupos.loja.com" });
  assert.deepEqual(normalizeHostname("vip.loja.co.uk"), { ok: true, hostname: "vip.loja.co.uk" });
});

test("recusa raiz da loja e pede subdomínio", () => {
  for (const raiz of ["sualoja.com.br", "sualoja.com", "loja.co.uk"]) {
    const r = normalizeHostname(raiz);
    assert.equal(r.ok, false, raiz);
    if (!r.ok) assert.match(r.error, /subdomínio/, raiz);
  }
});

test("recusa endereço inválido e IP", () => {
  for (const ruim of ["", "   ", "links..loja.com", "-links.loja.com", "links-.loja.com.br", "links_loja.com.br", "*.loja.com.br", "127.0.0.1", "links.loja.c0m"]) {
    assert.equal(normalizeHostname(ruim).ok, false, JSON.stringify(ruim));
  }
});

test("recusa host do próprio Girumo", () => {
  const r = normalizeHostname("app.girumo.com.br");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Girumo/);
});

test("registros DNS: CNAME para a Vercel e TXT de posse com o token", () => {
  assert.deepEqual(dnsRecordsFor("links.sualoja.com.br", "abc123"), {
    cname: { tipo: "CNAME", nome: "links.sualoja.com.br", valor: "cname.vercel-dns.com" },
    txt: { tipo: "TXT", nome: "_girumo-verify.links.sualoja.com.br", valor: "girumo-verify=abc123" },
  });
});
