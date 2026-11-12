import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ResumoDaEntrega } from "@/lib/painel/entrega";
import { LegendaDaEntrega } from "./entrega";

const resumo: ResumoDaEntrega = { entregues: 38, postando: 0, naFila: 0, falharam: 0, cancelados: 0, foraDoTeto: 0, total: 38 };
const render = (semTodos?: boolean) => renderToStaticMarkup(createElement(LegendaDaEntrega, { hora: "14:08", resumo, semTodos }));

test("post que saiu sem o @todos pedido diz isso e o porquê, abaixo da contagem", () => {
  const h = render(true);
  assert.match(h, /Post das 14:08:/);
  assert.match(h, /Saiu sem o @todos\./);
  assert.match(h, /Para proteger o número, o anti-ban não deixa nenhum post marcar todos: a marcação avisa cada pessoa, até quem silenciou o grupo, e é o que mais faz gente sair e denunciar o número\./);
  assert.match(h, /text-atencao/);
});

test("post sem corte não ganha a linha do @todos", () => {
  assert.doesNotMatch(render(false), /@todos/);
  assert.doesNotMatch(render(), /@todos/);
});
