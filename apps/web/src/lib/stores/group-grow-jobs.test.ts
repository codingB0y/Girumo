import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { listGroupsCreatedSince, listGroupsCreatedSinceByTenant } from "./group-grow-jobs";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `leads.test.ts`): prova, sem banco, os filtros da leitura dos grupos abertos
 * pelo "Grupo lotou → abre outro". O service-role passa por cima do RLS.
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

test("lê só os grupos criados pela campanha da loja desde o começo do dia, do mais antigo ao mais novo", async () => {
  pedidos.length = 0;
  linhas = [{ seq: 40, subject: "Mega Stock 40", whatsapp_group_id: "g40@g.us", updated_at: "2026-09-29T12:14:00+00:00" }];

  assert.deepEqual(await listGroupsCreatedSince("loja-a", "camp-1", "2026-09-29T03:00:00.000Z"), linhas);

  assert.equal(pedidos.length, 1);
  const [url] = pedidos;
  assert.equal(url.pathname, "/rest/v1/group_grow_jobs");
  assert.equal(url.searchParams.get("select"), "seq,subject,whatsapp_group_id,updated_at");
  // Mutantes: sem o tenant, a campanha de outra loja com o mesmo id; sem o status,
  // o job que falhou apareceria como grupo aberto.
  assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select")), {
    tenant_id: "eq.loja-a",
    campaign_group_id: "eq.camp-1",
    status: "eq.created",
    updated_at: "gte.2026-09-29T03:00:00.000Z",
    order: "updated_at.asc",
  });
});

test("na loja inteira, lê os grupos abertos de todas as campanhas da loja, sem filtrar campanha", async () => {
  pedidos.length = 0;
  linhas = [{ seq: 7, subject: "Brás 7", whatsapp_group_id: "g7@g.us", updated_at: "2026-10-02T12:14:00+00:00" }];

  assert.deepEqual(await listGroupsCreatedSinceByTenant("loja-a", "2026-10-02T03:00:00.000Z"), linhas);

  assert.equal(pedidos.length, 1);
  const [url] = pedidos;
  assert.equal(url.pathname, "/rest/v1/group_grow_jobs");
  assert.equal(url.searchParams.get("select"), "seq,subject,whatsapp_group_id,updated_at");
  // Mutante: sem o tenant, a Início de uma loja mostraria "novo 09:14" de outra.
  assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select")), {
    tenant_id: "eq.loja-a",
    status: "eq.created",
    updated_at: "gte.2026-10-02T03:00:00.000Z",
    order: "updated_at.asc",
  });
});
