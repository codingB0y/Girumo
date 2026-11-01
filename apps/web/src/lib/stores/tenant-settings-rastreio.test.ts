import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type * as Store from "./tenant-settings";

/** PostgREST falso: a query é a de produção, só a rede é trocada. */

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let status = 201;

const postgrest = createServer((req, res) => {
  const partes: Buffer[] = [];
  req.on("data", (p: Buffer) => partes.push(p));
  req.on("end", () => {
    const texto = Buffer.concat(partes).toString();
    pedidos.push({
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: texto ? JSON.parse(texto) : undefined,
    });
    res.statusCode = status;
    if (status >= 400) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "banco fora" }));
    } else res.end();
  });
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  store = await import("./tenant-settings");
});

after(() => {
  postgrest.close();
});

test("setRastreioEnabled faz upsert por tenant_id", async () => {
  pedidos.length = 0;
  status = 201;
  await store.setRastreioEnabled("loja-a", true);
  const [p] = pedidos;
  assert.equal(p.metodo, "POST");
  assert.equal(p.url.pathname, "/rest/v1/tenant_settings");
  assert.equal(p.url.searchParams.get("on_conflict"), "tenant_id");
  assert.match(p.prefer, /resolution=merge-duplicates/);
  const corpo = p.corpo as Record<string, unknown>;
  assert.deepEqual(Object.keys(corpo).sort(), ["rastreio_enabled", "tenant_id", "updated_at"]);
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.rastreio_enabled, true);
  assert.equal(typeof corpo.updated_at, "string");
});

test("erro do banco rejeita com a mensagem", async () => {
  status = 500;
  await assert.rejects(store.setRastreioEnabled("loja-a", false), /banco fora/);
});
