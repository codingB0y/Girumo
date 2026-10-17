import assert from "node:assert/strict";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ContatosVitrine } from "./contatos-vitrine";

// A Vitrine e o Odometro escrevem JSX sem `import React` (o Next usa o runtime
// automático); sob o tsx o JSX vira `React.createElement` e procura no escopo global.
Object.assign(globalThis, { React });

const noop = () => {};
const vitrine = (over: Partial<Parameters<typeof ContatosVitrine>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ContatosVitrine, {
      contatos: [],
      contagens: { todos: 0, novo: 0, ativo: 0, comprou: 0 },
      filtro: "todos",
      onFiltro: noop,
      busca: "",
      onBusca: noop,
      temMais: false,
      carregandoMais: false,
      onCarregarMais: noop,
      pedidos: [],
      meta: null,
      carregando: false,
      caixaOk: true,
      listaOk: true,
      aoTentarDeNovo: noop,
      onPedidoRegistrado: noop,
      ...over,
    }),
  );

test("lista que não carregou: alerta com Tentar de novo, nunca 'ninguém entrou'", () => {
  const h = vitrine({ listaOk: false });
  assert.match(h, /role="alert"/);
  assert.match(h, /<button[^>]*>Tentar de novo<\/button>/);
  assert.doesNotMatch(h, /Ninguém entrou ainda|A lista enche sozinha/);
});

test("lista carregada e vazia: aí sim o vazio de verdade, sem alerta", () => {
  const h = vitrine();
  assert.match(h, /Ninguém entrou ainda/);
  assert.doesNotMatch(h, /Tentar de novo/);
});
