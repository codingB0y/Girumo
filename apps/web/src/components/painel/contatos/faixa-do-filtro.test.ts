import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FaixaDoFiltro, textoDoFiltroVazio, tituloDoFiltro } from "./faixa-do-filtro";

const noop = () => {};
const faixa = (over: Partial<Parameters<typeof FaixaDoFiltro>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(FaixaDoFiltro, {
      titulo: "Quem comprou pelo anúncio “A1”",
      carga: "ok",
      vazio: null,
      aoTentarDeNovo: noop,
      aoVerTodos: noop,
      ...over,
    }),
  );

test("título do filtro pelo anúncio; nulo vira '(sem anúncio)'", () => {
  assert.equal(
    tituloDoFiltro({ campanha: "C", conjunto: "S", anuncio: "Verão Kids — vídeo 15s" }, "compraram"),
    "Quem comprou pelo anúncio “Verão Kids — vídeo 15s”",
  );
  assert.equal(
    tituloDoFiltro({ campanha: null, conjunto: null, anuncio: null }, "sem-compra"),
    "Quem entrou pelo anúncio “(sem anúncio)” e ainda não comprou",
  );
});

test("vazio do filtro diz por que está vazio, nunca o vazio da lista inteira", () => {
  assert.equal(
    textoDoFiltroVazio("compraram"),
    "Ninguém que comprou por este anúncio está em Contatos: o telefone veio só no pedido.",
  );
  assert.equal(textoDoFiltroVazio("sem-compra"), "Ninguém nesta lista: quem entrou por este anúncio já comprou.");
});

test("faixa carregada: título anunciado e o botão de voltar à lista inteira", () => {
  const h = faixa();
  assert.match(h, /role="status"/);
  assert.match(h, /Quem comprou pelo anúncio “A1”/);
  assert.match(h, /<button type="button"[^>]*>Ver todos os contatos<\/button>/);
  assert.doesNotMatch(h, /Tentar de novo|A lista enche sozinha/);
});

test("faixa vazia: título e o vazio do filtro", () => {
  const h = faixa({ vazio: textoDoFiltroVazio("sem-compra") });
  assert.match(h, /Quem comprou pelo anúncio “A1”/);
  assert.match(h, /Ninguém nesta lista: quem entrou por este anúncio já comprou\./);
});

test("faixa com erro: alerta, Tentar de novo e Ver todos; o título não aparece como se tivesse carregado", () => {
  const h = faixa({ carga: "erro" });
  assert.match(h, /role="alert"/);
  assert.match(h, /Não deu para carregar quem veio por este anúncio\./);
  assert.match(h, />Tentar de novo</);
  assert.match(h, />Ver todos os contatos</);
  assert.doesNotMatch(h, /Quem comprou pelo anúncio/);
});
