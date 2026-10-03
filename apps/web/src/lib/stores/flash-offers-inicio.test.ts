import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { listOfertasDaInicio } from "./flash-offers";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `group-grow-jobs.test.ts`): prova, sem banco, os filtros das duas leituras da
 * Início. O service-role passa por cima do RLS, então o tenant explícito é a
 * única proteção.
 */

const pedidos: URL[] = [];

const abertas = [
  {
    id: "o2",
    tenant_id: "loja-a",
    name: "Kit novo",
    status: "open",
    opened_at: "2026-10-03T15:00:00+00:00",
    flash_offer_groups: [
      { whatsapp_group_id: "g1@g.us", closed_at: null },
      { whatsapp_group_id: "g2@g.us", closed_at: "2026-10-03T15:30:00+00:00" },
      { whatsapp_group_id: "g3@g.us", closed_at: null },
    ],
  },
];
const doDia = [{ id: "o1", tenant_id: "loja-a", name: "Vestido", status: "closed" }];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  pedidos.push(url);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(url.searchParams.has("status") ? abertas : doDia));
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

test("lê as abertas e as do dia, as duas presas à loja, e junta só os grupos de janela aberta", async () => {
  pedidos.length = 0;

  const r = await listOfertasDaInicio("loja-a", "2026-10-03T03:00:00.000Z");

  assert.equal(pedidos.length, 2);
  for (const url of pedidos) {
    assert.equal(url.pathname, "/rest/v1/flash_offers");
    // Mutante: sem o tenant, a oferta no ar de outra loja aparece na Início.
    assert.equal(url.searchParams.get("tenant_id"), "eq.loja-a");
  }

  const dasAbertas = pedidos.find((u) => u.searchParams.has("status"));
  assert.ok(dasAbertas);
  assert.equal(dasAbertas.searchParams.get("status"), "eq.open");
  assert.equal(dasAbertas.searchParams.get("order"), "opened_at.desc");
  assert.match(dasAbertas.searchParams.get("select") ?? "", /flash_offer_groups\(whatsapp_group_id,\s*closed_at\)/);
  assert.equal(dasAbertas.searchParams.has("opened_at"), false);

  const doDiaUrl = pedidos.find((u) => u.searchParams.has("opened_at"));
  assert.ok(doDiaUrl);
  assert.equal(doDiaUrl.searchParams.get("opened_at"), "gte.2026-10-03T03:00:00.000Z");
  assert.equal(doDiaUrl.searchParams.get("order"), "opened_at.asc");
  assert.equal(doDiaUrl.searchParams.get("limit"), "50");
  assert.equal(doDiaUrl.searchParams.has("status"), false);

  // Janela fechada (g2) não é grupo da oferta no ar.
  assert.deepEqual(r.abertas[0].groupIds, ["g1@g.us", "g3@g.us"]);
  assert.equal(r.abertas[0].id, "o2");
  assert.deepEqual(r.doDia, doDia);
});
