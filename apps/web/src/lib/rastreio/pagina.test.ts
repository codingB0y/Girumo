import assert from "node:assert/strict";
import test from "node:test";

import { linhaDoTempo, NAO_ENCONTRADO, renderPagina, type ContextoDaPagina } from "./pagina";
import type { PedidoPublico } from "./tipos";

const NONCE = "bm9uY2UtZG8tdGVzdGUtMTIz";
const CTX: ContextoDaPagina = {
  loja: { nome: "Loja Exemplo", corPrimaria: "#0F766E", storeWhatsapp: null },
  base: "/rastreio/loja-exemplo",
  nonce: NONCE,
};

function pedido(over: Partial<PedidoPublico> = {}): PedidoPublico {
  return {
    id: "p1",
    numero: "1001",
    orderCreatedAt: "2026-10-18T17:32:00Z",
    etapa: "enviado",
    etapaAt: "2026-10-21T02:00:00Z",
    events: [
      { etapa: "confirmado", at: "2026-10-18T17:32:00Z" },
      { etapa: "enviado", at: "2026-10-21T02:00:00Z" },
    ],
    shipmentService: "Correios · SEDEX",
    trackingCode: "AB123456789BR",
    trackingUrl: "https://rastreio.exemplo.test/AB123456789BR",
    linkToken: "0123456789abcdef0123456789abcdef",
    noticesStoppedAt: null,
    ...over,
  };
}

const resumo = (passos: ReturnType<typeof linhaDoTempo>) => passos.map((p) => `${p.etapa}:${p.estado}:${p.quando}`);
const SEM_STYLE = /\sstyle=/;
const TERCEIRO = /<(script|link|img)[^>]*(src|href)="https?:/;

test("linha do tempo: feito, atual e falta, com dia de Brasília e sem data inventada", () => {
  // 02:00Z de 21/10 é 23:00 de 20/10 em Brasília.
  assert.deepEqual(resumo(linhaDoTempo(pedido())), [
    "confirmado:feito:18/10",
    "separando:feito:null",
    "enviado:atual:20/10",
    "entregue:falta:null",
  ]);
  assert.deepEqual(resumo(linhaDoTempo({ etapa: "entregue", events: [] })), [
    "confirmado:feito:null",
    "separando:feito:null",
    "enviado:feito:null",
    "entregue:atual:null",
  ]);
  assert.deepEqual(
    linhaDoTempo({ etapa: "retirada", events: [] }).map((p) => p.etapa),
    ["confirmado", "separando", "retirada", "entregue"],
  );
  assert.deepEqual(
    linhaDoTempo({
      etapa: "problema",
      events: [
        { etapa: "enviado", at: "2026-10-21T12:00:00Z" },
        { etapa: "problema", at: "2026-10-27T15:00:00Z" },
      ],
    }).map((p) => `${p.etapa}:${p.estado}`),
    ["confirmado:feito", "separando:feito", "enviado:feito", "problema:atual", "entregue:falta"],
  );
  assert.deepEqual(
    linhaDoTempo({ etapa: "aguardando_pagamento", events: [] }).map((p) => `${p.etapa}:${p.estado}`),
    ["aguardando_pagamento:atual", "confirmado:falta", "separando:falta", "enviado:falta", "entregue:falta"],
  );
  assert.deepEqual(
    linhaDoTempo({
      etapa: "cancelado",
      events: [
        { etapa: "confirmado", at: "2026-10-18T17:32:00Z" },
        { etapa: "cancelado", at: "2026-10-19T17:32:00Z" },
      ],
    }).map((p) => `${p.etapa}:${p.estado}`),
    ["confirmado:feito", "cancelado:atual"],
  );
});

test("busca: formulário na base, título da loja, nonce no style, sem style= nem script", () => {
  const html = renderPagina(CTX, { tipo: "busca", aviso: null });
  assert.ok(html.includes("<title>Acompanhe seu pedido · Loja Exemplo</title>"));
  assert.ok(html.includes('<form method="post" action="/rastreio/loja-exemplo"'));
  assert.ok(html.includes('name="documento"'));
  assert.ok(html.includes('name="celular"'));
  assert.ok(html.includes(`<style nonce="${NONCE}">`));
  assert.doesNotMatch(html, SEM_STYLE);
  assert.doesNotMatch(html, /<script/);
  assert.ok(!html.includes('role="alert"'));

  const comAviso = renderPagina(CTX, { tipo: "busca", aviso: NAO_ENCONTRADO });
  assert.ok(comAviso.includes('role="alert"'));
  assert.ok(comAviso.includes(NAO_ENCONTRADO));
});

test("texto de fora sai escapado", () => {
  const ctx: ContextoDaPagina = { ...CTX, loja: { ...CTX.loja, nome: '<script>alert(1)</script> & "Cia"' } };
  const html = renderPagina(ctx, {
    tipo: "pedido",
    pedido: pedido({ numero: "<b>1</b>", trackingCode: '"><img src=x>' }),
    convite: null,
  });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&amp;"));
  assert.ok(html.includes("&quot;Cia&quot;"));
  assert.ok(html.includes("&lt;b&gt;1&lt;/b&gt;"));
  assert.ok(html.includes('data-copiar="&quot;&gt;&lt;img src=x&gt;"'));
  assert.equal((html.match(/<script/g) ?? []).length, 1, "só o script do Copiar");
  assert.ok(!html.includes("<img"));
});

test("pedido: só os dados permitidos; Copiar com nonce; histórico só com URL http(s)", () => {
  const html = renderPagina(CTX, { tipo: "pedido", pedido: pedido(), convite: null });
  assert.ok(html.includes("Pedido nº 1001"));
  assert.ok(html.includes("feito em 18/10"));
  assert.ok(html.includes('aria-current="step"'));
  assert.ok(html.includes('data-copiar="AB123456789BR"'));
  assert.ok(html.includes(`<script nonce="${NONCE}">`));
  assert.match(html, /<a [^>]*href="https:\/\/rastreio\.exemplo\.test\/AB123456789BR"[^>]*rel="noopener noreferrer"/);
  assert.doesNotMatch(html, SEM_STYLE);
  assert.doesNotMatch(html, TERCEIRO);

  const js = renderPagina(CTX, { tipo: "pedido", pedido: pedido({ trackingUrl: "javascript:alert(1)" }), convite: null });
  assert.ok(!js.includes("javascript:"));
  assert.doesNotMatch(js, SEM_STYLE);

  const semCodigo = renderPagina(CTX, { tipo: "pedido", pedido: pedido({ trackingCode: null }), convite: null });
  assert.ok(!semCodigo.includes("data-copiar"));
  assert.doesNotMatch(semCodigo, /<script/);
  assert.doesNotMatch(semCodigo, SEM_STYLE);
  assert.doesNotMatch(semCodigo, TERCEIRO);
});

test("problema: alerta com a data e sem convite do VIP", () => {
  const problema = pedido({
    etapa: "problema",
    etapaAt: "2026-10-27T15:00:00Z",
    events: [
      { etapa: "enviado", at: "2026-10-21T12:00:00Z" },
      { etapa: "problema", at: "2026-10-27T15:00:00Z" },
    ],
  });
  const convite = "https://www.girumo.com.br/r/vip-loja";
  const html = renderPagina(CTX, { tipo: "pedido", pedido: problema, convite });
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes("A transportadora não conseguiu entregar"));
  assert.ok(html.includes("A entrega falhou em 27/10."));
  assert.ok(html.includes("Ver o motivo no histórico da entrega"));
  assert.ok(!html.includes("grupo VIP"));

  const enviado = renderPagina(CTX, { tipo: "pedido", pedido: pedido(), convite });
  assert.ok(enviado.includes(`href="${convite}" rel="noopener noreferrer"`));
  assert.ok(enviado.includes("Entrar no grupo VIP"));
});

test("Falar com a loja só com número; cor só #RRGGBB", () => {
  assert.ok(!renderPagina(CTX, { tipo: "busca", aviso: null }).includes("wa.me"));
  const comNumero: ContextoDaPagina = { ...CTX, loja: { ...CTX.loja, storeWhatsapp: "5511987650000" } };
  assert.ok(renderPagina(comNumero, { tipo: "busca", aviso: null }).includes('href="https://wa.me/5511987650000"'));
  assert.ok(renderPagina(comNumero, { tipo: "pedido", pedido: pedido(), convite: null }).includes('href="https://wa.me/5511987650000"'));

  const corRuim: ContextoDaPagina = { ...CTX, loja: { ...CTX.loja, corPrimaria: "red;}body{display:none" } };
  const html = renderPagina(corRuim, { tipo: "busca", aviso: null });
  assert.ok(html.includes("--cor:#14181C"));
  assert.ok(!html.includes("display:none"));
});

test("lista: um link por pedido, na ordem recebida", () => {
  const t2 = "0123456789abcdef0123456789abcd02";
  const t1 = "0123456789abcdef0123456789abcd01";
  const html = renderPagina(CTX, {
    tipo: "lista",
    pedidos: [pedido({ numero: "1002", linkToken: t2 }), pedido({ numero: "1001", linkToken: t1 })],
  });
  const i2 = html.indexOf(`href="/rastreio/loja-exemplo/${t2}"`);
  const i1 = html.indexOf(`href="/rastreio/loja-exemplo/${t1}"`);
  assert.ok(i2 > 0 && i1 > i2, "os dois links, na ordem recebida");
  assert.ok(html.includes("Pedido nº 1002"));
  assert.ok(html.includes("Enviado"));
  assert.ok(!html.includes("data-copiar"));
  assert.doesNotMatch(html, SEM_STYLE);
});
