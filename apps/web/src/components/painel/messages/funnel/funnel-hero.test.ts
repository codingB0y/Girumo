import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelHero } from "./funnel-hero";

const props = {
  templateId: "live" as const,
  templateLabel: "Lançamento de live",
  anchor: new Date(2026, 9, 10, 20, 0),
  mensagens: 4,
  grupos: 8,
  revendedoras: 1842,
  relampagos: 1,
};

test("frase da live cita o dia da âncora", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, props));
  assert.match(html, /Sua live de sábado, 10\/10, pronta pra vender\./);
  assert.match(html, /Funil · Lançamento de live/);
});

test("números em pt-BR e plural certo", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, props));
  assert.match(html, /1\.842/);
  assert.match(html, />mensagens</);
  assert.match(html, />oferta relâmpago</);
  const um = renderToStaticMarkup(createElement(FunnelHero, { ...props, mensagens: 1, relampagos: 2 }));
  assert.match(um, />mensagem</);
  assert.match(um, />ofertas relâmpago</);
});

test("sem âncora válida, pede a data", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, { ...props, anchor: null }));
  assert.match(html, /Escolha a data/);
});

test("nada de gradiente nem itálico (regra 9 da Vitrine)", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, props));
  assert.doesNotMatch(html, /gradient|italic/);
});
