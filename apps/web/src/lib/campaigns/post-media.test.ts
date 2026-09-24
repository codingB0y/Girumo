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

test("áudio e arquivo são recusados em vez de chegar quebrados no grupo", () => {
  // O fan-out mandava qualquer um destes como imagem: um PDF ou uma nota de voz
  // saíam pro grupo como "foto" que não abre.
  for (const tipo of ["audio", "file", "document"]) {
    assert.throws(() => resolvePostMediaType({ mediaId: "m", mediaType: tipo }), /foto ou vídeo/, tipo);
  }
});
