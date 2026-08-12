import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPublicUrl,
  buildShareMessage,
  buildWhatsAppShareHref,
  shareFileName,
  truncate,
  wrapWords,
} from "./share";

test("buildPublicUrl monta a URL pública e não duplica a barra do origin", () => {
  assert.equal(buildPublicUrl("https://girumo.com", "bazar-julho"), "https://girumo.com/p/bazar-julho");
  assert.equal(buildPublicUrl("https://girumo.com/", "bazar-julho"), "https://girumo.com/p/bazar-julho");
});

test("buildShareMessage junta nome em negrito, chamada e link", () => {
  const msg = buildShareMessage({
    storeName: "Mega Stock",
    headline: "Bazar de inverno com 60% off",
    url: "https://girumo.com/p/bazar",
  });

  assert.equal(msg, "*Mega Stock*\n\nBazar de inverno com 60% off\n\nhttps://girumo.com/p/bazar");
});

test("buildShareMessage não repete a chamada quando ela é igual ao nome da loja", () => {
  const msg = buildShareMessage({
    storeName: "Mega Stock",
    headline: "  mega stock ",
    url: "https://girumo.com/p/bazar",
  });

  assert.equal(msg, "*Mega Stock*\n\nhttps://girumo.com/p/bazar");
});

test("buildShareMessage sobrevive a headline ausente", () => {
  assert.equal(
    buildShareMessage({ storeName: "Loja", headline: null, url: "https://x.com/p/a" }),
    "*Loja*\n\nhttps://x.com/p/a",
  );
});

test("buildWhatsAppShareHref escapa o texto", () => {
  const href = buildWhatsAppShareHref("*Loja*\n\nhttps://girumo.com/p/a?x=1&y=2");

  assert.ok(href.startsWith("https://wa.me/?text="));
  assert.ok(href.includes("%0A%0A"));
  assert.ok(href.includes("%26y%3D2"));
});

test("shareFileName usa o slug e a variante", () => {
  assert.equal(shareFileName("bazar-julho", "qrcode"), "girumo-bazar-julho-qrcode.png");
  assert.equal(shareFileName("bazar-julho", "story"), "girumo-bazar-julho-story.png");
});

test("truncate devolve o texto intacto quando cabe", () => {
  assert.equal(truncate("Mega Stock", 20), "Mega Stock");
});

test("truncate corta na palavra e marca com reticência", () => {
  assert.equal(truncate("Bazar de inverno da Mega Stock", 20), "Bazar de inverno…");
});

test("truncate corta no meio da palavra quando não há espaço utilizável", () => {
  const out = truncate("Superatacadaodemodainfantil", 10);

  assert.equal(out.length, 10);
  assert.ok(out.endsWith("…"));
});

test("wrapWords quebra em linhas respeitando o limite", () => {
  assert.deepEqual(wrapWords("bazar de inverno agora", 12, 3), ["bazar de", "inverno", "agora"]);
});

test("wrapWords não devolve mais linhas que o máximo", () => {
  const linhas = wrapWords("uma duas tres quatro cinco seis sete oito", 10, 2);

  assert.equal(linhas.length, 2);
  linhas.forEach((l) => assert.ok(l.length <= 10, `linha "${l}" estourou o limite`));
});

test("wrapWords sinaliza com reticência quando sobra texto", () => {
  const linhas = wrapWords("uma duas tres quatro cinco seis sete oito", 10, 2);

  assert.ok(linhas[linhas.length - 1].endsWith("…"), `última linha sem reticência: ${linhas.join(" | ")}`);
});

test("wrapWords não inventa reticência quando o texto coube inteiro", () => {
  const linhas = wrapWords("bazar de inverno", 20, 3);

  assert.deepEqual(linhas, ["bazar de inverno"]);
});

test("wrapWords corta palavra única maior que a linha", () => {
  const linhas = wrapWords("Superatacadaodemodainfantil", 10, 2);

  assert.equal(linhas.length, 1);
  assert.ok(linhas[0].length <= 10);
});

test("wrapWords devolve vazio pra texto em branco", () => {
  assert.deepEqual(wrapWords("   ", 10, 2), []);
});
