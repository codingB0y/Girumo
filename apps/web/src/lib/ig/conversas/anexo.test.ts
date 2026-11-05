import assert from "node:assert/strict";
import { test } from "node:test";
import { classificarAnexo, IMAGEM_MAX_BYTES, VIDEO_MAX_BYTES } from "./anexo";

test("PNG e JPEG até 8 MB são foto; MP4 até 25 MB é vídeo", () => {
  assert.deepEqual(classificarAnexo("image/png", 1000), { ok: true, tipo: "image" });
  assert.deepEqual(classificarAnexo("image/jpeg", IMAGEM_MAX_BYTES), { ok: true, tipo: "image" });
  assert.deepEqual(classificarAnexo("video/mp4", VIDEO_MAX_BYTES), { ok: true, tipo: "video" });
  assert.deepEqual(classificarAnexo("IMAGE/PNG", 10), { ok: true, tipo: "image" }, "a caixa do tipo não importa");
});

test("acima do limite recusa com o limite do Instagram na mensagem", () => {
  const foto = classificarAnexo("image/jpeg", IMAGEM_MAX_BYTES + 1);
  assert.equal(foto.ok, false);
  assert.match(foto.ok ? "" : foto.mensagem, /8 MB/);
  const video = classificarAnexo("video/mp4", VIDEO_MAX_BYTES + 1);
  assert.match(video.ok ? "" : video.mensagem, /25 MB/);
});

test("tipo fora da lista, vazio ou sem tamanho válido é recusado", () => {
  for (const [mime, bytes] of [["image/webp", 10], ["image/gif", 10], ["video/quicktime", 10], ["application/pdf", 10], ["audio/mpeg", 10], ["", 10], ["image/png", 0], ["image/png", Number.NaN]] as const) {
    assert.equal(classificarAnexo(mime, bytes).ok, false, `${mime} ${bytes}`);
  }
  const r = classificarAnexo("image/webp", 10);
  assert.match(r.ok ? "" : r.mensagem, /PNG|JPEG|MP4/);
});
