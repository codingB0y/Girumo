import test from "node:test";
import assert from "node:assert/strict";

import { resolvePostMediaType } from "./post-media";

test("post sem mídia não tem tipo de mídia", () => {
  assert.equal(resolvePostMediaType({}), undefined);
  assert.equal(resolvePostMediaType({ mediaType: "video" }), undefined);
});

test("foto e vídeo passam; mídia sem tipo continua sendo foto", () => {
  assert.equal(resolvePostMediaType({ mediaId: "m", mediaType: "image" }), "image");
  assert.equal(resolvePostMediaType({ mediaId: "m", mediaType: "video" }), "video");
  assert.equal(resolvePostMediaType({ mediaId: "m" }), "image");
});

test("áudio passa e sai como nota de voz", () => {
  assert.equal(resolvePostMediaType({ mediaId: "m", mediaType: "audio" }), "audio");
  assert.equal(resolvePostMediaType({ mediaId: "m", mediaType: "audio", body: "   " }), "audio");
});

test("áudio com texto é recusado — nota de voz não tem legenda e o texto sumiria", () => {
  assert.throws(() => resolvePostMediaType({ mediaId: "m", mediaType: "audio", body: "oferta" }), /sem legenda/);
});

test("arquivo passa como file, com legenda", () => {
  // O worker manda como documento pela extensão; "document" é o nome antigo do mesmo tipo.
  for (const tipo of ["file", "document"]) {
    assert.equal(resolvePostMediaType({ mediaId: "m", mediaType: tipo, body: "catálogo novo" }), "file", tipo);
  }
});
