import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { getPrivadoInstance, listGroupInstances, listInstances } from "./instances";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de `posts-hoje.test.ts`):
 * prova, sem banco, que cada seletor de número pede o recorte certo de `purpose`.
 */

type Pedido = { metodo: string; url: URL };

const pedidos: Pedido[] = [];
let resposta: unknown[] = [];

const postgrest = createServer((req, res) => {
  req.on("data", () => undefined);
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso") });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // maybeSingle() pede um objeto só (vnd.pgrst.object+json): linha única, ou vazio sem linha.
    const querObjeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (querObjeto && resposta.length === 0) {
      res.statusCode = 406;
      res.end(JSON.stringify({ code: "PGRST116", message: "0 rows", details: "The result contains 0 rows" }));
      return;
    }
    res.end(JSON.stringify(querObjeto ? resposta[0] : resposta));
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

test("listGroupInstances pede só os números dos grupos da loja, com o purpose no select", async () => {
  pedidos.length = 0;
  resposta = [{ id: "g", purpose: "grupos" }];
  await listGroupInstances("loja-a");
  const [p] = pedidos;
  assert.equal(p.url.pathname, "/rest/v1/instances");
  assert.equal(p.url.searchParams.get("tenant_id"), "eq.loja-a");
  // Mutante: sem o filtro, o número do atendimento entra em todo seletor de post.
  assert.equal(p.url.searchParams.get("purpose"), "eq.grupos");
  assert.equal(p.url.searchParams.get("order"), "created_at.asc");
  assert.match(p.url.searchParams.get("select") ?? "", /\bpurpose\b/);
});

test("listInstances continua vendo todos os números da loja", async () => {
  pedidos.length = 0;
  resposta = [];
  await listInstances("loja-a");
  assert.equal(pedidos[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedidos[0].url.searchParams.get("purpose"), null);
  assert.match(pedidos[0].url.searchParams.get("select") ?? "", /\bpurpose\b/);
});

test("getPrivadoInstance pede o número do atendimento da loja e devolve null sem linha", async () => {
  pedidos.length = 0;
  resposta = [];
  assert.equal(await getPrivadoInstance("loja-a"), null);
  assert.equal(pedidos[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedidos[0].url.searchParams.get("purpose"), "eq.privado");
  resposta = [{ id: "p", purpose: "privado" }];
  assert.equal((await getPrivadoInstance("loja-a"))?.id, "p");
});
