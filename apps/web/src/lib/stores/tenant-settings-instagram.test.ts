import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type * as Store from "./tenant-settings";

/** PostgREST falso: a query é a de produção, só a rede é trocada. */

type Pedido = { metodo: string; url: URL; corpo: Record<string, unknown> };
const pedidos: Pedido[] = [];
let respostas: Array<{ status: number; body?: unknown }> = [];

const postgrest = createServer((req, res) => {
  const partes: Buffer[] = [];
  req.on("data", (p: Buffer) => partes.push(p));
  req.on("end", () => {
    const texto = Buffer.concat(partes).toString();
    pedidos.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso"), corpo: texto ? JSON.parse(texto) : {} });
    const r = respostas.shift() ?? { status: 201 };
    res.statusCode = r.status;
    res.setHeader("Content-Type", "application/json");
    res.end(r.body ? JSON.stringify(r.body) : "");
  });
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  store = await import("./tenant-settings");
});
after(() => { postgrest.close(); });

test("desligar o add-on carimba instagram_disabled_at; ligar limpa", async () => {
  pedidos.length = 0;
  respostas = [];
  await store.setInstagramEnabled("loja-a", false);
  assert.equal(pedidos[0].metodo, "GET", "lê o carimbo atual antes de gravar");
  const off = pedidos[1];
  assert.deepEqual([off.metodo, off.url.pathname, off.url.searchParams.get("on_conflict")], ["POST", "/rest/v1/tenant_settings", "tenant_id"]);
  assert.equal(off.corpo.tenant_id, "loja-a");
  assert.equal(off.corpo.instagram_enabled, false);
  assert.equal(typeof off.corpo.instagram_disabled_at, "string");
  assert.ok(!Number.isNaN(Date.parse(String(off.corpo.instagram_disabled_at))));

  await store.setInstagramEnabled("loja-a", true);
  assert.equal(pedidos.length, 3, "ligar não lê nada");
  assert.equal(pedidos[2].corpo.instagram_enabled, true);
  assert.equal(pedidos[2].corpo.instagram_disabled_at, null);
});

test("desligar de novo (evento repetido do Stripe) mantém o carimbo original", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: { instagram_disabled_at: "2026-10-01T00:00:00+00:00" } }];
  await store.setInstagramEnabled("loja-a", false);
  assert.equal(pedidos[1].corpo.instagram_disabled_at, "2026-10-01T00:00:00+00:00");
});

test("banco sem a coluna instagram_disabled_at: regrava só a flag", async () => {
  pedidos.length = 0;
  respostas = [
    { status: 400, body: { code: "42703", message: 'column tenant_settings.instagram_disabled_at does not exist' } },
    { status: 400, body: { code: "42703", message: 'column "instagram_disabled_at" of relation "tenant_settings" does not exist' } },
  ];
  await store.setInstagramEnabled("loja-a", false);
  assert.equal(pedidos.length, 3);
  assert.ok("instagram_disabled_at" in pedidos[1].corpo);
  assert.ok(!("instagram_disabled_at" in pedidos[2].corpo));
  assert.equal(pedidos[2].corpo.instagram_enabled, false);
});

test("outro erro do banco estoura", async () => {
  pedidos.length = 0;
  respostas = [{ status: 500, body: { code: "XX000", message: "banco fora" } }];
  await assert.rejects(() => store.setInstagramEnabled("loja-a", true), /banco fora/);
  assert.equal(pedidos.length, 1);
});
