import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { recordGroupMemberEvents } from "./group-member-events";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o mesmo desenho de
 * `leads.test.ts`): a query que sai é a de produção, só a rede é trocada. É o
 * que prova, sem banco, o filtro de loja e a regra de "só grupo onde a loja é
 * admin" num store que o service-role executa por cima do RLS.
 */

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };

const pedidos: Pedido[] = [];
let grupoExiste = true;

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    if (url.pathname === "/rest/v1/groups") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(grupoExiste ? [{ id: "grupo-uuid" }] : []));
      return;
    }
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

after(() => {
  postgrest.close();
});

const movimento = { kind: "join" as const, participants: ["1@lid", "2@lid"], occurredAt: "2026-09-29T14:08:00.000Z" };

/** Os filtros da query, sem o `select`. */
function filtros(url: URL): Record<string, string> {
  return Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));
}

test("grava uma linha por pessoa, da loja e do grupo certos, e ignora a repetida", async () => {
  pedidos.length = 0;
  grupoExiste = true;

  assert.equal(await recordGroupMemberEvents("loja-a", "g40@g.us", movimento), 2);

  assert.deepEqual(
    pedidos.map((p) => [p.metodo, p.url.pathname]),
    [
      ["GET", "/rest/v1/groups"],
      ["POST", "/rest/v1/group_member_events"],
    ],
  );
  // Mutantes: sem o tenant, o service-role acharia o grupo de outra loja; sem o
  // is_admin, grupo de terceiro viraria lista de quem entra nele.
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", whatsapp_group_id: "eq.g40@g.us", is_admin: "eq.true" });

  const insercao = pedidos[1];
  // Mutante: sem ignore-duplicates, a reentrega viraria erro de chave única (ou, sem o índice, contagem dupla).
  assert.match(insercao.prefer, /resolution=ignore-duplicates/);
  assert.equal(insercao.url.searchParams.get("on_conflict"), "tenant_id,whatsapp_group_id,occurred_at,participant,kind");
  assert.deepEqual(insercao.corpo, [
    { tenant_id: "loja-a", whatsapp_group_id: "g40@g.us", participant: "1@lid", kind: "join", occurred_at: "2026-09-29T14:08:00.000Z" },
    { tenant_id: "loja-a", whatsapp_group_id: "g40@g.us", participant: "2@lid", kind: "join", occurred_at: "2026-09-29T14:08:00.000Z" },
  ]);
});

test("grupo que não é da loja (ou onde ela não é admin) não grava nada", async () => {
  pedidos.length = 0;
  grupoExiste = false;

  assert.equal(await recordGroupMemberEvents("loja-a", "terceiro@g.us", movimento), 0);
  assert.deepEqual(pedidos.map((p) => p.url.pathname), ["/rest/v1/groups"]);
});
