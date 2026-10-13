import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { claimPendingBroadcasts } from "./broadcasts";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `broadcast-deliveries.test.ts`): prova, sem banco, o que o claim do motor legado
 * (`/api/dispatch/pending`) pede. Ele só pega `run_id is null`, e `enqueue_broadcast`
 * sempre grava run_id — mas um disparo com regra de destino (`target_rule`) tem
 * `group_ids` vazio, e o motor legado leria `group_ids` vazio como "todos os grupos"
 * (spec 2026-10-10-postar-por-grupo §5.5).
 */

const pedidos: Array<{ metodo: string; url: URL }> = [];

const postgrest = createServer((req, res) => {
  pedidos.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso") });
  res.setHeader("Content-Type", "application/json");
  res.end("[]");
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

test("o claim legado só pega disparo da loja, na fila, sem run_id e sem regra de destino", async () => {
  pedidos.length = 0;

  assert.deepEqual(await claimPendingBroadcasts("loja-a"), []);

  assert.equal(pedidos.length, 1);
  const pedido = pedidos[0];
  assert.ok(pedido, "nenhum pedido chegou ao PostgREST");
  assert.equal(pedido.metodo, "PATCH");
  assert.equal(pedido.url.pathname, "/rest/v1/broadcasts");
  // Mutante: sem este filtro, disparo com regra e group_ids vazio iria para TODOS os grupos.
  assert.equal(pedido.url.searchParams.get("target_rule"), "is.null");
  // Mutantes antigos: sem run_id o legado reenviaria o que o worker novo enfileirou;
  // sem tenant, claimaria disparo de outra loja.
  assert.equal(pedido.url.searchParams.get("run_id"), "is.null");
  assert.equal(pedido.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedido.url.searchParams.get("status"), "eq.queued");
});
