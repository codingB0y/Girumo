// apps/web/src/lib/integracoes/cadastro-do-site.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lerCadastro } from "./cadastro-do-site";

const BASE = {
  whatsapp: "62999998888",
  page_url:
    "https://modakidsdosul.com.br/vip?utm_source=ig&utm_medium=paid&utm_campaign=VIP%20Atacado%20%E2%80%94%20Goi%C3%A2nia&utm_term=Lojistas&utm_content=Ver%C3%A3o%20Kids&fbclid=abc123",
  event_id: "3f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  fbc: "fb.1.1728000000000.abc123",
  fbp: "fb.1.1727000000000.987654321",
};

test("lê o cadastro do site com UTMs decodificados da page_url", () => {
  const lido = lerCadastro(BASE);
  assert.ok(lido.ok);
  assert.equal(lido.cadastro.whatsapp, "+5562999998888");
  assert.equal(lido.cadastro.eventId, BASE.event_id);
  assert.deepEqual(lido.cadastro.utm, {
    source: "ig",
    medium: "paid",
    campaign: "VIP Atacado — Goiânia",
    content: "Verão Kids",
    term: "Lojistas",
  });
  assert.equal(lido.cadastro.fbclid, "abc123");
  assert.equal(lido.cadastro.fbc, BASE.fbc);
  assert.equal(lido.cadastro.fbp, BASE.fbp);
});

test("parâmetro vazio vira null, repetido vale o primeiro e longo é cortado em 200", () => {
  const longo = "x".repeat(300);
  const lido = lerCadastro({
    ...BASE,
    page_url: `https://loja.test/vip?utm_source=&utm_campaign=A&utm_campaign=B&utm_content=${longo}`,
    fbc: undefined,
    fbp: undefined,
  });
  assert.ok(lido.ok);
  assert.equal(lido.cadastro.utm.source, null);
  assert.equal(lido.cadastro.utm.campaign, "A");
  assert.equal(lido.cadastro.utm.content?.length, 200);
  assert.equal(lido.cadastro.fbc, null);
  assert.equal(lido.cadastro.fbclid, null);
});

test("número inválido é 'numero'; o resto inválido é 'corpo'", () => {
  assert.deepEqual(lerCadastro({ ...BASE, whatsapp: "123" }), { ok: false, erro: "numero" });
  assert.deepEqual(lerCadastro({ ...BASE, link: "vip-atacado" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, event_id: "curto" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, event_id: "tem espaço aqui!!" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, page_url: "javascript:alert(1)" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, page_url: "não é url" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro({ ...BASE, fbc: "qualquer coisa" }), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro(null), { ok: false, erro: "corpo" });
  assert.deepEqual(lerCadastro("texto"), { ok: false, erro: "corpo" });
});
