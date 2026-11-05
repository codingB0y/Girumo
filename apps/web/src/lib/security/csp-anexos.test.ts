import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** A CSP do painel deixa o anexo do Instagram aparecer na tela Conversas (a rota de mídia responde 302 para o CDN da Meta). */

const NEXT_CONFIG = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
const HOST = "https://lookaside.fbsbx.com";

test("o host do CDN de mensagens está numa constante só, e só o painel o usa", () => {
  assert.match(NEXT_CONFIG, /const CDN_DOS_ANEXOS = "https:\/\/lookaside\.fbsbx\.com";/);
  const usos = NEXT_CONFIG.split("\n").filter((l) => l.includes("CDN_DOS_ANEXOS") && !l.includes("const CDN_DOS_ANEXOS"));
  assert.equal(usos.length, 2, "img-src e media-src, e mais nada (a prévia do editor e as públicas ficam como estavam)");
  assert.ok(usos.some((l) => l.includes("img-src")));
  assert.ok(usos.some((l) => l.includes("media-src")));
});

test("media-src existe com blob: (prévia local do envio) e sem curinga amplo; img-src não ganha `https:` solto", () => {
  assert.match(NEXT_CONFIG, /`media-src 'self' blob: \$\{CDN_DOS_ANEXOS\}`/);
  for (const [, diretiva] of NEXT_CONFIG.matchAll(/["`]((?:img|media)-src [^"`]*)["`]/g)) {
    assert.doesNotMatch(diretiva, /(^|\s)https:(\s|$)/, `${diretiva} liberou todo https:`);
    assert.doesNotMatch(diretiva, /\*\.fbcdn|\*\.cdninstagram|\*\.facebook/, "só o host medido/documentado");
  }
  assert.ok(HOST.startsWith("https://"));
});
