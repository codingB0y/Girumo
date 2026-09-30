import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { listBroadcastDeliveries } from "./broadcast-deliveries";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `leads.test.ts`): prova, sem banco, que a leitura da entrega filtra a loja e a
 * rodada do post. O service-role passa por cima do RLS de `engine_commands`.
 */

const pedidos: URL[] = [];
let linhas: unknown[] = [];

const postgrest = createServer((req, res) => {
  pedidos.push(new URL(req.url ?? "/", "http://postgrest.falso"));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(linhas));
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

test("lê os comandos da loja, do post e da rodada atual, com o grupo tirado do payload", async () => {
  pedidos.length = 0;
  linhas = [{ jid: "g40@g.us", status: "done", completed_at: "2026-09-23T17:08:30Z", failed_at: null }];

  assert.deepEqual(await listBroadcastDeliveries("loja-a", "post-1", "rodada-2"), linhas);

  assert.equal(pedidos.length, 1);
  const [url] = pedidos;
  assert.equal(url.pathname, "/rest/v1/engine_commands");
  // Mutante: `select *` traria o texto do post e a credencial de mídia de cada comando.
  assert.equal(url.searchParams.get("select"), "jid:payload->>jid,status,completed_at,failed_at");
  // Mutantes: sem o tenant, o post de outra loja com o mesmo id apareceria; sem a
  // rodada, o post que repete todo dia misturaria as entregas de ontem com as de hoje.
  assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select")), {
    tenant_id: "eq.loja-a",
    origin_kind: "eq.broadcast",
    origin_id: "eq.post-1",
    origin_run_id: "eq.rodada-2",
  });
});
