import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bolha } from "./bolha";

const base = { grupo: "Mega Stock · Revendedoras 12", hora: "19:00", texto: "Abriu!" };

test("sem as props novas, a bolha fica como era (3 usos existentes)", () => {
  const html = renderToStaticMarkup(createElement(Bolha, base));
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /@todos/);
  assert.match(html, /Abriu!/);
});

test("foto aparece acima do texto", () => {
  const html = renderToStaticMarkup(createElement(Bolha, { ...base, foto: "blob:abc" }));
  assert.match(html, /<img[^>]*src="blob:abc"[^>]*class="pn-bolha__foto"|<img[^>]*class="pn-bolha__foto"[^>]*src="blob:abc"/);
  assert.ok(html.indexOf("<img") < html.indexOf("Abriu!"));
});

test("@todos antecede a mensagem", () => {
  const html = renderToStaticMarkup(createElement(Bolha, { ...base, mencaoTodos: true }));
  assert.ok(html.indexOf("@todos") > -1 && html.indexOf("@todos") < html.indexOf("Abriu!"));
});

test("sem texto, @todos não aparece sozinho sobre o 'vazio'", () => {
  const html = renderToStaticMarkup(createElement(Bolha, { ...base, texto: "", vazio: "aparece aqui", mencaoTodos: true }));
  assert.doesNotMatch(html, /@todos/);
});
