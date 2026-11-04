import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { FiltroDeEntregas, LinhaDeEntrega, RespostaDeEntregas } from "@/lib/rastreio/entregas";
import { TabelaDeEntregas } from "./entregas-tabela";

const noop = () => {};
const LINHAS: LinhaDeEntrega[] = [
  { id: "1", numero: "1001", primeiroNome: "Ana", etapa: "problema", etapaAt: "2026-10-28T15:00:00Z", semCodigoHaDias: null,
    trackingCode: "BR123", avisos: [{ texto: "WhatsApp falhou", falhou: true }, { texto: "e-mail enviado", falhou: false }],
    link: "https://exemplo.test/c/abc", telefone: "5511987654321", podeReenviar: true },
  { id: "2", numero: "1002", primeiroNome: null, etapa: "enviado", etapaAt: "2026-10-28T15:00:00Z", semCodigoHaDias: null,
    trackingCode: null, avisos: [{ texto: "nenhum ainda", falhou: false }], link: null, telefone: null, podeReenviar: false },
  { id: "3", numero: "1003", primeiroNome: "Bia", etapa: "separando", etapaAt: "2026-10-25T15:00:00Z", semCodigoHaDias: 4,
    trackingCode: null, avisos: [{ texto: "nenhum ainda", falhou: false }], link: null, telefone: null, podeReenviar: false },
];
const RESPOSTA: RespostaDeEntregas = {
  numeros: { todos: 29, aCaminho: 23, semCodigo: 4, problema: 2, whatsappFalhou: 1, entreguesEm7Dias: 5, avisosHoje: { whatsapp: 3, email: 2 } },
  filtro: "todos", pagina: 1, porPagina: 25, total: 29, linhas: LINHAS, atualizadoEm: "2026-10-29T15:00:00Z",
};

function render(o: { resposta?: Partial<RespostaDeEntregas>; filtro?: FiltroDeEntregas; busca?: string; erro?: string | null } = {}) {
  return renderToStaticMarkup(
    createElement(TabelaDeEntregas, {
      resposta: { ...RESPOSTA, ...o.resposta }, filtro: o.filtro ?? "todos", busca: o.busca ?? "", carregando: false,
      erro: o.erro ?? null, aoFiltrar: noop, aoBuscar: noop, aoPaginar: noop, aoReenviar: noop, reenviando: null,
    }),
  );
}

test("chips: só o filtro ativo tem aria-pressed true, com contagens", () => {
  const h = render({ filtro: "problema" });
  assert.equal((h.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(h, /aria-pressed="true"[^>]*>Problema · 2</);
  assert.match(h, /Todos · 29/);
  assert.match(h, /WhatsApp falhou · 1/);
});

test("chip WhatsApp falhou some com 0, exceto ativo", () => {
  const zero = { numeros: { ...RESPOSTA.numeros, whatsappFalhou: 0 } };
  assert.doesNotMatch(render({ resposta: zero }), /WhatsApp falhou · /);
  assert.match(render({ resposta: zero, filtro: "whatsapp_falhou" }), /WhatsApp falhou · 0/);
});

test("coluna de ação tem cabeçalho sr-only e ações por linha", () => {
  const h = render();
  assert.match(h, /<th[^>]*class="sr-only"[^>]*>Ação</);
  assert.match(h, /href="https:\/\/wa\.me\/5511987654321"/);
  assert.match(h, /rel="noopener noreferrer"/);
  assert.equal((h.match(/Chamar compradora/g) ?? []).length, 1);
  assert.equal((h.match(/Reenviar aviso/g) ?? []).length, 1);
  assert.equal((h.match(/>Ver</g) ?? []).length, 1);
});

test("situação, aviso em negrito, nome ausente, sem dados sensíveis", () => {
  const h = render();
  assert.match(h, /Sem código há 4 dias/);
  assert.match(h, /<strong[^>]*>WhatsApp falhou<\/strong>/);
  assert.doesNotMatch(h, /<td[^>]*>[^<]*(@|11144477735)/);
});

test("vazio por filtro, por busca e geral", () => {
  const vazio = { linhas: [], total: 0 };
  assert.match(render({ resposta: vazio }), /Nenhum pedido em andamento nos últimos 30 dias\./);
  assert.match(render({ resposta: vazio, filtro: "problema" }), /Nenhum pedido neste filtro\./);
  assert.match(render({ resposta: vazio, busca: "xyz" }),
    /Nenhum pedido encontrado nas entregas dos últimos 30 dias\. Pedido que ainda não saiu da loja não aparece aqui\./);
});

test("erro em role=alert e rodapé com hora", () => {
  assert.match(render({ erro: "Falhou" }), /role="alert"[^>]*>Falhou/);
  assert.match(render(), /atualizado às 12:00/);
  assert.match(render(), /Página 1 de 2/);
});
