import assert from "node:assert/strict";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScheduleComposer } from "./schedule-composer";

// O tsx do teste usa o runtime clássico de JSX (mesmo padrão de hero-logo.test.ts).
(globalThis as typeof globalThis & { React: typeof React }).React = React;

/** Campos de digitar do HTML: input (menos checkbox e arquivo), textarea e select. */
function camposDeDigitar(html: string): string[] {
  return [...html.matchAll(/<(input|textarea|select)\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/type="(checkbox|file|hidden)"/.test(tag));
}

// Abaixo de 16px o Safari do iPhone dá zoom no foco e empurra a folha de postar
// pra fora da tela. A enquete só abre com clique: o e2e da casca mede ela aberta.
test("data, horário, recorrência e o texto do post têm 16px", () => {
  const html = renderToStaticMarkup(createElement(ScheduleComposer, { onSchedule: async () => true }));
  const campos = camposDeDigitar(html);
  assert.equal(campos.length, 4, "o compositor de agendar perdeu ou ganhou campo");
  for (const campo of campos) assert.match(campo, /text-\[16px\]/, campo);
});
