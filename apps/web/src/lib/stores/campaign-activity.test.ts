import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { campaignActivity, campaignGroupMemberCounts } from "./campaign-activity";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `leads.test.ts`): prova, sem banco, que as duas RPCs da série levam a loja no
 * corpo. O service-role passa por cima do RLS, e `p_tenant` é o que isola.
 */

type Pedido = { caminho: string; corpo: Record<string, unknown> };

const pedidos: Pedido[] = [];
let linhas: unknown[] = [];

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    pedidos.push({ caminho: new URL(req.url ?? "/", "http://postgrest.falso").pathname, corpo: bruto ? JSON.parse(bruto) : {} });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(linhas));
  });
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

const hoje = { de: new Date("2026-09-29T03:00:00Z"), ate: new Date("2026-09-30T03:00:00Z"), fatia: "hour" as const };

test("a série traz entraram e saíram de cada fatia, com a loja na RPC", async () => {
  pedidos.length = 0;
  // O PostgREST devolve bigint como número ou texto, conforme o tamanho: os dois viram número.
  linhas = [{ bucket: "2026-09-29T15:00:00+00:00", novas_pessoas: 2, cliques: "7", entraram: "9", sairam: 2 }];

  assert.deepEqual(await campaignActivity("loja-a", { id: "camp-1", groupIds: ["g40@g.us"] }, hoje), [
    { inicio: "2026-09-29T15:00:00.000Z", novas: 2, cliques: 7, entraram: 9, sairam: 2 },
  ]);
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/campaign_activity");
  assert.equal(pedidos[0].corpo.p_tenant, "loja-a");
});

test("a contagem por grupo leva a loja e os grupos da campanha, e volta indexada pelo grupo", async () => {
  pedidos.length = 0;
  linhas = [
    { whatsapp_group_id: "g40@g.us", entraram: "12", sairam: 2 },
    { whatsapp_group_id: "g39@g.us", entraram: 0, sairam: "1" },
  ];

  assert.deepEqual(await campaignGroupMemberCounts("loja-a", ["g40@g.us", "g39@g.us"], hoje), {
    "g40@g.us": { entraram: 12, sairam: 2 },
    "g39@g.us": { entraram: 0, sairam: 1 },
  });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/campaign_group_member_counts");
  // Mutante: sem p_tenant a RPC nem existe com essa assinatura; com o tenant errado, conta outra loja.
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a",
    p_group_ids: ["g40@g.us", "g39@g.us"],
    p_from: "2026-09-29T03:00:00.000Z",
    p_to: "2026-09-30T03:00:00.000Z",
  });
});
