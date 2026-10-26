// apps/web/src/components/painel/link-da-bio/previa.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentoPadrao, type DadosRender } from "@/lib/bio/documento";
import { renderPaginaBio } from "@/lib/bio/render";

import { PreviaNaColuna, PreviaNoCelular, QuadroDaPrevia } from "./previa";

const noop = () => {};
const DADOS: DadosRender = {
  documento: { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), animar: true, links: [] },
  paginaId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  campanhas: {},
  linksEscondidos: [],
  origem: "https://www.girumo.com.br",
  dominioProprio: false,
};

function srcdoc(h: string): string {
  return /srcDoc="([^"]*)"/.exec(h)?.[1] ?? "";
}

test("a prévia é um iframe sem permissão nenhuma, fora do Tab, com o HTML do renderizador em modo prévia", () => {
  const h = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 0 }));
  assert.match(h, /<iframe title="Prévia da página"/);
  assert.match(h, /sandbox=""/);
  assert.match(h, /tabindex="-1"/);
  const doc = srcdoc(h);
  assert.ok(doc.includes("Loja Exemplo"));
  assert.doesNotMatch(doc, /&lt;script/i);
});

test("ao montar, a prévia desenha parada: a entrada só toca quando a rodada muda", () => {
  const h = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 3 }));
  const parado = renderToStaticMarkup(
    createElement("iframe", { srcDoc: renderPaginaBio(DADOS, { modo: "previa", nonce: null, animarEntrada: false }) }),
  );
  assert.equal(srcdoc(h), srcdoc(parado));
});

test("coluna do computador: prévia nomeada, chip do modelo e Rever a animação (desligado sem animação)", () => {
  const h = renderToStaticMarkup(createElement(PreviaNaColuna, { dados: DADOS, rodada: 0, aoReverAnimacao: noop }));
  assert.match(h, /<aside aria-label="Prévia da página" class="hidden /);
  assert.match(h, />Modelo Etiqueta</);
  assert.match(h, /<button type="button" class="[^"]*">[\s\S]*Rever a animação<\/button>/);
  const sem = renderToStaticMarkup(
    createElement(PreviaNaColuna, {
      dados: { ...DADOS, documento: { ...DADOS.documento, animar: false } },
      rodada: 0,
      aoReverAnimacao: noop,
    }),
  );
  assert.match(sem, /<button type="button" disabled=""[^>]*>[\s\S]*Rever a animação/);
});

test("celular: botão Ver como fica, e a folha da tela cheia só monta ao tocar", () => {
  const h = renderToStaticMarkup(createElement(PreviaNoCelular, { dados: DADOS, rodada: 0, aoReverAnimacao: noop }));
  assert.match(h, /<button type="button" aria-haspopup="dialog" class="pn-bio-ver /);
  assert.match(h, />Ver como fica</);
  assert.doesNotMatch(h, /role="dialog"/);
});

test("miniatura do modelo: inert e escondida do leitor de tela; a prévia comum não", () => {
  const mini = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 0, miniatura: true }));
  assert.match(mini, /sandbox="" tabindex="-1" inert="" aria-hidden="true" class=/);
  const comum = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 0 }));
  assert.match(comum, /sandbox="" tabindex="-1" class=/);
});
