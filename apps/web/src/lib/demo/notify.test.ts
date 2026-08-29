import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml } from "./html-escape";

/**
 * Cobertura de `escapeHtml`, usada por `notify.ts` para sanitizar o e-mail de
 * aviso de venda. `notify.ts` começa com `import "server-only"`, que
 * `tsx --test` não consegue carregar — por isso o helper mora num módulo puro
 * próprio (`./html-escape`) e é testado direto daqui, sem passar pelo módulo
 * server-only.
 */

test("escapa & isoladamente", () => {
  assert.equal(escapeHtml("a & b"), "a &amp; b");
});

test("escapa < isoladamente", () => {
  assert.equal(escapeHtml("a < b"), "a &lt; b");
});

test("escapa > isoladamente", () => {
  assert.equal(escapeHtml("a > b"), "a &gt; b");
});

test("escapa aspas duplas isoladamente", () => {
  assert.equal(escapeHtml('a "b" c'), "a &quot;b&quot; c");
});

test("escapa aspas simples isoladamente", () => {
  assert.equal(escapeHtml("a 'b' c"), "a &#39;b&#39; c");
});

test("neutraliza um payload completo de link malicioso", () => {
  const payload = '<a href="https://evil.example">Clique aqui para redefinir sua senha</a>';
  const escaped = escapeHtml(payload);
  assert.equal(
    escaped,
    "&lt;a href=&quot;https://evil.example&quot;&gt;Clique aqui para redefinir sua senha&lt;/a&gt;"
  );
  // Nenhuma tag viva sobrevive — o payload escapado não contém mais `<` ou `>` cru.
  assert.equal(escaped.includes("<"), false);
  assert.equal(escaped.includes(">"), false);
});

test("texto sem caracteres especiais passa intacto", () => {
  assert.equal(escapeHtml("Igor Toledo"), "Igor Toledo");
});
