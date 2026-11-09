import assert from "node:assert/strict";
import { test } from "node:test";

import { pedidoYampi } from "@/test/rastreio-dados-falsos";

import { CONSUMIDORES } from "./consumidores";
import type { ConexaoYampi } from "./tipos";

process.env.RASTREIO_DOC_PEPPER = "pepper-de-teste-com-tamanho-suficiente-1234";

test("a entrada rastreio assina só os três eventos de pedido e liga pela flag do módulo", async () => {
  const { rastreioLigado } = await import("@/lib/stores/rastreio-config");
  const entradas = CONSUMIDORES.filter((c) => c.nome === "rastreio");
  assert.equal(entradas.length, 1);
  assert.deepEqual([...entradas[0].eventos], ["order.created", "order.paid", "order.status.updated"]);
  assert.equal(entradas[0].ligado, rastreioLigado);
});

test("consumir passa a loja, o recurso (não o envelope) e a origem aviso", async () => {
  const entrada = CONSUMIDORES.find((c) => c.nome === "rastreio");
  assert.ok(entrada);
  const avisos: string[] = [];
  const original = console.warn;
  console.warn = (m: string) => void avisos.push(m);
  try {
    const r = await entrada.consumir({
      eventoId: "e1",
      tenantId: "loja-a",
      conexao: {} as ConexaoYampi,
      evento: "order.paid",
      time: "2026-10-29 10:00:00",
      recurso: {},
      payload: pedidoYampi(),
    });
    assert.equal(r, null);
  } finally {
    console.warn = original;
  }
  assert.deepEqual(avisos, ["[rastreio] loja-a: pedido da Yampi fora do formato (aviso)"]);
});
