import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { desmarcarAlertaReconectar, listarReconectarSemAlerta } from "./bling-conexoes-alertas";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de bling-conexoes.test.ts). */

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
let resposta: { status: number; body: unknown } = { status: 200, body: [] };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    res.statusCode = resposta.status;
    res.end(JSON.stringify(resposta.body));
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

function preparar(status: number, body: unknown): void {
  pedidos.length = 0;
  resposta = { status, body };
}
const filtros = (i: number) => Object.fromEntries([...pedidos[i].url.searchParams].filter(([k]) => k !== "select"));

test("desmarcarAlertaReconectar volta o alerta para nulo só na loja", async () => {
  preparar(200, []);
  await desmarcarAlertaReconectar("loja-a");
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a" });
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.reconnect_alerted_at, null);
  assert.equal(typeof corpo.updated_at, "string");
});

test("listarReconectarSemAlerta: lojas em reconectar cujo e-mail não saiu, só o id", async () => {
  preparar(200, [{ tenant_id: "loja-a" }, { tenant_id: "loja-b" }]);
  assert.deepEqual(await listarReconectarSemAlerta(), ["loja-a", "loja-b"]);
  assert.deepEqual(filtros(0), { status: "eq.reconectar", reconnect_alerted_at: "is.null" });
  assert.equal(pedidos[0].url.searchParams.get("select"), "tenant_id");
});

test("erro do banco estoura com a mensagem", async () => {
  preparar(500, { code: "XX000", message: "caiu", details: null, hint: null });
  await assert.rejects(desmarcarAlertaReconectar("loja-a"), /caiu/);
  await assert.rejects(listarReconectarSemAlerta(), /caiu/);
});
