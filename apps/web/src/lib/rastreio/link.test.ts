import assert from "node:assert/strict";
import { test } from "node:test";
import { linkDaBusca, linkDoPedido } from "@/lib/rastreio/link";

delete process.env.NEXT_PUBLIC_SITE_URL; // a origem padrão, como no CI
const TOKEN = "0123456789abcdef0123456789abcdef";
test("sem domínio próprio, o www da Girumo com o slug; com domínio ativo, o caminho curto", () => {
  const girumo = { dominio: null, publicSlug: "loja-teste" }, propria = { dominio: "loja.exemplo.com.br", publicSlug: "loja-teste" };
  assert.equal(linkDoPedido(girumo, TOKEN), `https://www.girumo.com.br/rastreio/loja-teste/${TOKEN}`);
  assert.equal(linkDaBusca(girumo), "https://www.girumo.com.br/rastreio/loja-teste");
  assert.equal(linkDoPedido(propria, TOKEN), `https://loja.exemplo.com.br/rastreio/${TOKEN}`);
  assert.equal(linkDaBusca(propria), "https://loja.exemplo.com.br/rastreio");
});
test("domínio que não é só um hostname cai no link do www, sem vazar o token", () => {
  for (const dominio of ["evil.com/x?", "a@b.com", "evil.com:8080", "a b.com", "evil.com#"]) {
    const loja = { dominio, publicSlug: "loja-teste" };
    assert.equal(linkDoPedido(loja, TOKEN), `https://www.girumo.com.br/rastreio/loja-teste/${TOKEN}`, dominio);
    assert.equal(linkDaBusca(loja), "https://www.girumo.com.br/rastreio/loja-teste", dominio);
  }
});
