import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { recordTrackedLinkClick } from "./tracked-links";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de ig-accounts.test.ts). */

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.statusCode = 201;
    res.end();
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const LINK = { id: "link-1", tenant_id: "loja-a", campaign_group_id: "camp-1" };

test("grava o cadastro e o grupo escolhido junto do clique", async () => {
  pedidos.length = 0;
  await recordTrackedLinkClick(LINK, { captureId: "cad-1", whatsappGroupId: "1203@g.us" });
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/link_click_events"]);
  assert.deepEqual(pedidos[0].corpo, {
    tenant_id: "loja-a",
    tracked_link_id: "link-1",
    campaign_group_id: "camp-1",
    capture_id: "cad-1",
    whatsapp_group_id: "1203@g.us",
  });
});

test("sem extra (link comum, chamada antiga): as colunas novas vão nulas", async () => {
  pedidos.length = 0;
  await recordTrackedLinkClick({ ...LINK, campaign_group_id: null });
  assert.deepEqual(pedidos[0].corpo, {
    tenant_id: "loja-a",
    tracked_link_id: "link-1",
    campaign_group_id: null,
    capture_id: null,
    whatsapp_group_id: null,
  });
});
