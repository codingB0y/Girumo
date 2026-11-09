import assert from "node:assert/strict";
import { test } from "node:test";

import { previaDoEmail, previaDoWhatsapp } from "./previas";

const D = { loja: "Loja Exemplo", linkDaBusca: "https://loja.exemplo.test/rastreio", storeWhatsapp: "5511987654321" };

test("WhatsApp ainda sem fonte (mensagens.ts do PR 5): null", () => {
  assert.equal(previaDoWhatsapp("enviado", D), null);
});

test("e-mail usa a fonte real com a compradora de exemplo e o link da loja", () => {
  const p = previaDoEmail("enviado", D);
  assert.ok(p);
  assert.equal(p.assunto, "Seu pedido nº 1541 foi enviado");
  assert.ok(p.texto.includes("Oi, Ana! Seu pedido nº 1541 da Loja Exemplo foi enviado (PAC)."));
  assert.ok(p.texto.includes("AB123456789BR"));
  assert.ok(p.texto.includes("https://loja.exemplo.test/rastreio/exemplo"));
  assert.ok(!p.texto.includes("loja-exemplo"));
  assert.ok(p.texto.includes("https://wa.me/5511987654321"));
});
