import assert from "node:assert/strict";
import { test } from "node:test";
import { isProdDomainUrl, PROD_DOMAINS } from "./environment";

test("flags the Girumo production hosts", () => {
  assert.equal(isProdDomainUrl("https://app.girumo.com.br"), true);
  assert.equal(isProdDomainUrl("https://girumo.com.br"), true);
  assert.equal(isProdDomainUrl("https://www.girumo.com.br"), true);
});

test("still flags the legacy hubflow hosts while they resolve", () => {
  assert.equal(isProdDomainUrl("https://app.hubflow.com.br"), true);
  assert.equal(isProdDomainUrl("https://hubflow.com.br"), true);
});

test("ignores a path or query around the host", () => {
  assert.equal(isProdDomainUrl("https://app.girumo.com.br/painel?x=1"), true);
});

test("does not flag staging subdomains", () => {
  // Regressão: com match por substring, "girumo.com.br" casava dentro de
  // "staging.girumo.com.br" e o guard bloqueava um ambiente legítimo.
  assert.equal(isProdDomainUrl("https://staging.girumo.com.br"), false);
  assert.equal(isProdDomainUrl("https://preview.hubflow.com.br"), false);
});

test("does not flag lookalike hosts", () => {
  assert.equal(isProdDomainUrl("https://girumo.com.br.evil.com"), false);
  assert.equal(isProdDomainUrl("https://notgirumo.com.br"), false);
});

test("does not flag local development", () => {
  assert.equal(isProdDomainUrl("http://localhost:3000"), false);
  assert.equal(isProdDomainUrl(""), false);
});

test("accepts a bare hostname without protocol", () => {
  assert.equal(isProdDomainUrl("app.girumo.com.br"), true);
  assert.equal(isProdDomainUrl("staging.girumo.com.br"), false);
});

test("keeps both brands in the denylist during the transition", () => {
  assert.ok(PROD_DOMAINS.includes("app.girumo.com.br"));
  assert.ok(PROD_DOMAINS.includes("app.hubflow.com.br"));
});
