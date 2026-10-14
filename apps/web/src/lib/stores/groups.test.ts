import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { contarEstruturaDeComunidade, listGroups } from "./groups";

/** PostgREST de mentira (o desenho de `group-grow-jobs.test.ts`) que respeita `offset`/`limit`. */

const TOTAL = 2500;
const todas = Array.from({ length: TOTAL }, (_, i) => ({ id: `id-${i}`, whatsapp_group_id: `g${i}@g.us`, tenant_id: "loja-a" }));
const pedidos: URL[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  pedidos.push(url);
  // A contagem de estrutura de comunidade: o banco devolve só os que casaram com o filtro.
  if (url.searchParams.has("community_role")) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([{ whatsapp_group_id: "avisos@g.us" }, { whatsapp_group_id: "pai@g.us" }]));
    return;
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(todas.slice(offset, offset + limit)));
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

test("listGroups traz todos os grupos, não só a primeira página de 1000, sempre filtrando o tenant", async () => {
  pedidos.length = 0;
  const grupos = await listGroups("loja-a");

  assert.equal(grupos.length, TOTAL);
  assert.equal(new Set(grupos.map((g) => g.id)).size, TOTAL);
  assert.equal(pedidos.length, 3);
  for (const p of pedidos) assert.equal(p.searchParams.get("tenant_id"), "eq.loja-a");
});

test("contarEstruturaDeComunidade conta só pai e Avisos entre os JIDs dados, sempre na loja", async () => {
  pedidos.length = 0;
  const n = await contarEstruturaDeComunidade("loja-a", ["avisos@g.us", "pai@g.us", "comum@g.us"]);

  assert.equal(n, 2);
  assert.equal(pedidos.length, 1);
  const [p] = pedidos;
  assert.equal(p.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(p.searchParams.get("community_role"), "in.(parent,announce)");
  assert.match(String(p.searchParams.get("whatsapp_group_id")), /^in.(.*avisos@g.us.*pai@g.us.*comum@g.us.*)$/);
});

test("contarEstruturaDeComunidade sem JID nenhum não pergunta ao banco", async () => {
  pedidos.length = 0;
  assert.equal(await contarEstruturaDeComunidade("loja-a", []), 0);
  assert.equal(pedidos.length, 0);
});
