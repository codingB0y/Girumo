import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SaudeDoCodigo } from "@/lib/rastreio/entregas";
import { PainelDoBlocoCodigo } from "./bloco-codigo-rastreio";

const render = (saude: SaudeDoCodigo) => renderToStaticMarkup(createElement(PainelDoBlocoCodigo, { saude }));

test("com pedido sem código: contagem, barra verde, aviso e link de Entregas", () => {
  const h = render({ enviados: 15, comCodigo: 14, maisAntigoSemCodigo: { id: "x", numero: "1539", desde: "2026-10-25T15:00:00Z" } });
  assert.match(h, /14 de 15/);
  assert.match(h, /Pedido nº 1539 está faturado desde 25\/10 e ainda sem código\./);
  assert.match(h, /href="\/painel\/vendas\/entregas\?filtro=sem_codigo"/);
  assert.match(h, /bg-success-700[^>]*style="width:93%"/);
  assert.match(h, /A Girumo lê os pedidos e cria na sua loja só o aviso de pedido novo\. Não muda pedido, produto nem preço\./);
  assert.match(h, /href="\/painel\/configuracoes\?secao=rastreio"/);
});

test("abaixo da meta a barra fica âmbar, sem aviso", () => {
  const h = render({ enviados: 15, comCodigo: 11, maisAntigoSemCodigo: null });
  assert.match(h, /bg-warning-700/);
  assert.doesNotMatch(h, /ainda sem código/);
});

test("sem envio: frase própria, sem barra", () => {
  const h = render({ enviados: 0, comCodigo: 0, maisAntigoSemCodigo: null });
  assert.match(h, /Nenhum pedido enviado nos últimos 7 dias\./);
  assert.doesNotMatch(h, /style="width/);
});
