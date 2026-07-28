import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo, LogoSymbol } from "./logo";

test("renders the approved two-mass Girumo symbol", () => {
  const html = renderToStaticMarkup(createElement(LogoSymbol));

  assert.match(html, /viewBox="0 0 24 24"/);
  assert.equal((html.match(/<path/g) || []).length, 2);
  assert.doesNotMatch(html, /mask|gradient|hf-link-mask/i);
});

test("renders the Girumo wordmark", () => {
  const html = renderToStaticMarkup(createElement(Logo));

  assert.match(html, /aria-label="Girumo"/);
  assert.equal((html.match(/data-girumo-wordmark-path/g) || []).length, 6);
  assert.doesNotMatch(html, /HubFlow/);
});

test("keeps the approved optical lockup contract", () => {
  const html = renderToStaticMarkup(createElement(Logo));

  assert.match(html, /gap-\[0\.28em\]/);
  assert.match(html, /h-\[1\.06em\]/);
  assert.match(html, /top-\[-0\.015em\]/);
});

test("hides decorative lockups from assistive technology", () => {
  const html = renderToStaticMarkup(createElement(Logo, { title: null }));

  assert.match(html, /<span[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html, /aria-label=/);
});
