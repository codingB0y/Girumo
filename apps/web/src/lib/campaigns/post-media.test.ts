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

test("arquivo é recusado em vez de chegar quebrado no grupo", () => {
  // O fan-out manda documento sem nome nem mimetype: um PDF saía pro grupo como
  // "foto" que não abre.
  for (const tipo of ["file", "document"]) {
    assert.throws(() => resolvePostMediaType({ mediaId: "m", mediaType: tipo }), /foto, vídeo ou áudio/, tipo);
  }
});
