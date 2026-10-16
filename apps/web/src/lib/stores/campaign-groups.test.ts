import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { deleteCampaignGroup } from "./campaign-groups";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (molde de
 * `broadcasts.test.ts`). Excluir a campanha passa por `deleteCampaignGroup` em
 * todos os chamadores (rota DELETE e o rollback do link mestre): é aqui que os
 * posts agendados dela precisam ser cancelados, antes da linha sumir.
 */

type Pedido = { metodo: string; url: URL };
const pedidos: Pedido[] = [];
let falharEm: string | null = null;

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  const pedido = { metodo: req.method ?? "", url };
  pedidos.push(pedido);
  res.setHeader("Content-Type", "application/json");
  if (`${pedido.metodo} ${url.pathname}` === falharEm) {
    res.statusCode = 500;
    res.end(JSON.stringify({ message: "banco fora" }));
    return;
  }
  res.end(JSON.stringify(pedido.metodo === "GET" && url.pathname === "/rest/v1/broadcasts" ? [{ id: "post-1" }] : []));
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

test("excluir a campanha cancela os posts dela antes de apagar a linha", async () => {
  pedidos.length = 0;
  falharEm = null;

  await deleteCampaignGroup("loja-a", "camp-1");

  assert.deepEqual(
    pedidos.map(({ metodo, url }) => `${metodo} ${url.pathname}`),
    [
      "GET /rest/v1/broadcasts",
      "DELETE /rest/v1/schedules",
      "PATCH /rest/v1/engine_commands",
      "DELETE /rest/v1/campaign_groups",
    ],
  );
  const apagar = pedidos[3].url.searchParams;
  assert.equal(apagar.get("tenant_id"), "eq.loja-a");
  assert.equal(apagar.get("id"), "eq.camp-1");
});

test("se o cancelamento falha, a campanha fica: nunca sobra post agendado sem campanha", async () => {
  pedidos.length = 0;
  falharEm = "DELETE /rest/v1/schedules";

  await assert.rejects(deleteCampaignGroup("loja-a", "camp-1"), /banco fora/);

  assert.equal(pedidos.some(({ url }) => url.pathname === "/rest/v1/campaign_groups"), false);
});
