import assert from "node:assert/strict";
import { test } from "node:test";

import { corDaLoja, montarEmailDoAviso } from "./email";
import { linkDoPedido } from "./link";
import type { LojaDoRastreio } from "./loja";
import type { EtapaComAviso, PedidoInterno } from "./tipos";

const LOJA: LojaDoRastreio = { tenantId: "t-1", nome: "Loja Exemplo", publicSlug: "loja-exemplo", dominio: null, corPrimaria: "#BE185D", storeWhatsapp: "5511999990000", vipLinkId: null };
const PEDIDO: PedidoInterno = { id: "p-1", numero: "1532", orderCreatedAt: "2026-10-20T13:00:00.000Z", etapa: "enviado", etapaAt: "2026-10-21T13:14:00.000Z", events: [], shipmentService: "Correios SEDEX", trackingCode: "AB123456789BR", trackingUrl: null, linkToken: "0123456789abcdef0123456789abcdef", noticesStoppedAt: null, tenantId: "t-1", externalId: "9001", statusRaw: "on_carriage", buyerFirstName: "Maria", buyerPhone: "5511987654321", buyerEmailEnc: null };
const LINK = linkDoPedido(LOJA, PEDIDO.linkToken);

test("enviado: saudação, serviço, código, WhatsApp da loja e dois links para a página do pedido", () => {
  const { subject, html, text } = montarEmailDoAviso(LOJA, PEDIDO, "enviado", null);
  assert.equal(subject, "Seu pedido nº 1532 foi enviado");
  assert.ok(html.includes("Oi, Maria! Seu pedido nº 1532 da Loja Exemplo foi enviado (Correios SEDEX)."));
  assert.ok(html.includes("Código de rastreio · Correios SEDEX") && html.includes("AB123456789BR") && html.includes(">LE<"));
  assert.equal(html.split(`href="${LINK}"`).length - 1, 2); // botão e "Parar avisos"
  assert.ok(html.includes("Enviado pela Girumo em nome da Loja Exemplo.") && html.includes('href="https://wa.me/5511999990000"'));
  assert.ok(!html.includes("grupo VIP") && text.includes(LINK) && !/<[a-z/]/i.test(text));
});

test("texto do banco entra escapado no HTML e cru no assunto e no texto", () => {
  const loja = { ...LOJA, nome: 'Moda <b>"Sul"</b> & Cia' };
  const pedido = { ...PEDIDO, numero: "15\n32", trackingCode: "<script>x</script>", buyerFirstName: "<i>Ana" };
  const { subject, html, text } = montarEmailDoAviso(loja, pedido, "enviado", { url: 'https://x.test/a"b' });
  assert.ok(!html.includes("<script>") && !html.includes("<b>") && !html.includes("<i>Ana"));
  assert.ok(html.includes("Moda &lt;b&gt;&quot;Sul&quot;&lt;/b&gt; &amp; Cia") && html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(html.includes("Oi, &lt;i&gt;Ana!") && html.includes('href="https://x.test/a&quot;b"'));
  assert.ok(text.includes('Moda <b>"Sul"</b> & Cia'));
  assert.equal(subject, "Seu pedido nº 15 32 foi enviado");
});

test("sem primeiro nome a saudação é 'Olá!'; cor inválida cai na neutra e não vira CSS", () => {
  const { html } = montarEmailDoAviso({ ...LOJA, corPrimaria: "red;} body{display:none" }, { ...PEDIDO, buyerFirstName: null }, "entregue", null);
  assert.ok(html.includes("Olá! Seu pedido nº 1532 da Loja Exemplo foi entregue.") && !html.includes("Oi, ") && !html.includes("display:none"));
  assert.deepEqual([corDaLoja("#BE185D"), corDaLoja("#FFE600"), corDaLoja(null), corDaLoja("red;}")], ["#be185d", "#857800", "#14181c", "#14181c"]);
});

test("convite, WhatsApp da loja e código só aparecem com dado", () => {
  const url = "https://www.girumo.com.br/r/vip-exemplo";
  const com = montarEmailDoAviso(LOJA, PEDIDO, "enviado", { url });
  assert.ok(com.html.includes("As novidades saem primeiro no grupo VIP") && com.html.includes(`<a href="${url}"`) && com.text.includes(url));
  for (const storeWhatsapp of [null, "abc"]) assert.ok(!montarEmailDoAviso({ ...LOJA, storeWhatsapp }, PEDIDO, "enviado", null).html.includes("wa.me"));
  assert.ok(!montarEmailDoAviso(LOJA, { ...PEDIDO, trackingCode: null }, "confirmado", null).html.includes("Código de rastreio"));
});

test("cada etapa tem assunto e título próprios; o terceiro passo do andamento acompanha", () => {
  const casos: Array<[EtapaComAviso, string, string]> = [
    ["confirmado", "Recebemos o pagamento do pedido nº 1532", "Pagamento confirmado"],
    ["enviado", "Seu pedido nº 1532 foi enviado", "Seu pedido está a caminho"],
    ["retirada", "Seu pedido nº 1532 está pronto para retirada", "Seu pedido está pronto para retirada"],
    ["problema", "Problema na entrega do pedido nº 1532", "A entrega não foi concluída"],
    ["entregue", "Seu pedido nº 1532 foi entregue", "Seu pedido foi entregue"],
  ];
  for (const [etapa, assunto, titulo] of casos) {
    const r = montarEmailDoAviso(LOJA, PEDIDO, etapa, null);
    assert.equal(r.subject, assunto);
    assert.ok(r.html.includes(`>${titulo}</h1>`), etapa);
  }
  const retirada = montarEmailDoAviso(LOJA, PEDIDO, "retirada", null).html;
  assert.ok(retirada.includes(">Retirada<") && !retirada.includes(">Enviado<"));
  assert.match(montarEmailDoAviso(LOJA, PEDIDO, "enviado", null).html, />Confirmado<[\s\S]*>Separado<[\s\S]*>Enviado<[\s\S]*>Entregue</);
});

test("o assunto não carrega caracteres de controle do número do pedido", () => {
  const { subject } = montarEmailDoAviso(LOJA, { ...PEDIDO, numero: "15\u000032\u202E" }, "enviado", null);
  assert.ok(!/[\u0000\u202E]/.test(subject));
});
