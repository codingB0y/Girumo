import assert from "node:assert/strict";
import { test } from "node:test";
import { marcoDaEtiqueta, normalizarCodigo, type EtiquetaMelhorEnvio } from "@/lib/rastreio/marcos";

const AGORA = new Date("2026-11-02T15:00:00Z");
const etiqueta = (extra: Partial<EtiquetaMelhorEnvio> = {}): EtiquetaMelhorEnvio => ({
  tracking: "AB123456789BR",
  status: "posted",
  criadaEm: "2026-10-28T12:00:00.000Z",
  atualizadaEm: "2026-11-01T18:00:00.000Z",
  entregueEm: null,
  ...extra,
});

test("entregue usa delivered_at", () => {
  assert.deepEqual(marcoDaEtiqueta(etiqueta({ status: "delivered", entregueEm: "2026-11-01T17:32:00.000Z" }), AGORA), {
    etapa: "entregue",
    em: "2026-11-01T17:32:00.000Z",
    statusRaw: "melhorenvio:delivered",
  });
});

test("entregue sem delivered_at usa updated_at; sem os dois, agora", () => {
  assert.equal(marcoDaEtiqueta(etiqueta({ status: "delivered" }), AGORA)?.em, "2026-11-01T18:00:00.000Z");
  assert.equal(marcoDaEtiqueta(etiqueta({ status: "delivered", atualizadaEm: null }), AGORA)?.em, AGORA.toISOString());
});

test("não entregue e pausado viram problema", () => {
  for (const status of ["undelivered", "paused"]) {
    assert.deepEqual(marcoDaEtiqueta(etiqueta({ status }), AGORA), {
      etapa: "problema",
      em: "2026-11-01T18:00:00.000Z",
      statusRaw: `melhorenvio:${status}`,
    });
  }
});

test("os outros status não mexem", () => {
  for (const status of ["pending", "released", "generated", "posted", "canceled", "suspended", "Delivered", "delivered; drop"])
    assert.equal(marcoDaEtiqueta(etiqueta({ status }), AGORA), null, status);
});

test("normalizarCodigo tira espaço, sobe a caixa e recusa vazio/não-texto", () => {
  assert.equal(normalizarCodigo(" ab 123456789 br "), "AB123456789BR");
  assert.equal(normalizarCodigo(""), null);
  assert.equal(normalizarCodigo(null), null);
  assert.equal(normalizarCodigo(123), null);
});
