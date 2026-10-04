import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { listGroups } from "./groups";

/** PostgREST de mentira (o desenho de `group-grow-jobs.test.ts`) que respeita `offset`/`limit`. */

const TOTAL = 2500;
const todas = Array.from({ length: TOTAL }, (_, i) => ({ id: `id-${i}`, whatsapp_group_id: `g${i}@g.us`, tenant_id: "loja-a" }));
const pedidos: URL[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  pedidos.push(url);
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
