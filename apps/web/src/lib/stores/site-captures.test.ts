import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { CadastroDoSite } from "@/lib/integracoes/cadastro-do-site";
import { cadastroDaLoja, gravarCadastro } from "./site-captures";
import { integracaoPelaChave, salvarChave } from "./site-integrations";
import { getTrackedLinkById } from "./tracked-links";

/** O cliente real do Supabase contra um PostgREST de mentira (mesmo molde de ig-accounts.test.ts). */

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let respostas: { status: number; body: unknown }[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    const proxima = respostas.shift() ?? { status: 200, body: [] };
    res.setHeader("Content-Type", "application/json");
    res.statusCode = proxima.status;
    res.end(JSON.stringify(proxima.body));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

const CADASTRO: CadastroDoSite = {
  whatsapp: "+5562999998888",
  eventId: "evento-123456",
  pageUrl: "https://loja.test/vip?utm_campaign=C1",
  utm: { source: "ig", medium: "paid", campaign: "C1", content: "A1", term: "S1" },
  fbclid: null,
  fbc: "fb.1.1.abc",
  fbp: null,
};

test("grava o cadastro com a loja e o link da integração, sem IP nem user-agent", async () => {
  pedidos.length = 0;
  respostas = [{ status: 201, body: { id: "cad-1" } }];
  assert.deepEqual(await gravarCadastro("loja-a", "link-1", CADASTRO), { id: "cad-1", novo: true });
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/site_captures"]);
  assert.deepEqual(corpo, {
    tenant_id: "loja-a",
    tracked_link_id: "link-1",
    whatsapp: "+5562999998888",
    event_id: "evento-123456",
    page_url: "https://loja.test/vip?utm_campaign=C1",
    utm_source: "ig",
    utm_medium: "paid",
    utm_campaign: "C1",
    utm_content: "A1",
    utm_term: "S1",
    fbclid: null,
    fbc: "fb.1.1.abc",
    fbp: null,
  });
});

test("mesmo event_id (23505) devolve o cadastro existente da MESMA loja, novo = false", async () => {
  pedidos.length = 0;
  respostas = [
    { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint", details: null, hint: null } },
    { status: 200, body: [{ id: "cad-antigo" }] },
  ];
  assert.deepEqual(await gravarCadastro("loja-a", "link-1", CADASTRO), { id: "cad-antigo", novo: false });
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", event_id: "eq.evento-123456", limit: "1" });
});

test("outro erro do banco estoura com a mensagem", async () => {
  respostas = [{ status: 500, body: { code: "XX000", message: "caiu", details: null, hint: null } }];
  await assert.rejects(gravarCadastro("loja-a", "link-1", CADASTRO), /caiu/);
});

test("cadastroDaLoja filtra pela loja e pelo id", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: [{ id: "cad-1" }] }, { status: 200, body: [] }];
  assert.equal(await cadastroDaLoja("loja-a", "cad-1"), true);
  assert.equal(await cadastroDaLoja("loja-b", "cad-1"), false);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.cad-1", limit: "1" });
});

test("integração pela chave lê só pelo hash e não pede o hash de volta", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: [{ tenant_id: "loja-a", key_last4: "AbCd", tracked_link_id: "link-1", created_at: "t", rotated_at: null, last_used_at: null }] }];
  const integracao = await integracaoPelaChave("f".repeat(64));
  assert.deepEqual(integracao, { tenantId: "loja-a", keyLast4: "AbCd", trackedLinkId: "link-1", createdAt: "t", rotatedAt: null, lastUsedAt: null });
  assert.deepEqual(filtros(pedidos[0].url), { key_hash: `eq.${"f".repeat(64)}`, limit: "1" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("key_hash"));
});

test("salvar chave faz upsert por loja com o hash, nunca a chave", async () => {
  pedidos.length = 0;
  respostas = [{ status: 201, body: [] }];
  await salvarChave("loja-a", { hash: "a".repeat(64), last4: "WXYZ", trackedLinkId: "link-1" });
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "tenant_id");
  assert.match(pedidos[0].prefer, /resolution=merge-duplicates/);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.key_hash, "a".repeat(64));
  assert.equal(corpo.key_last4, "WXYZ");
  assert.equal(corpo.tracked_link_id, "link-1");
  assert.equal(typeof corpo.rotated_at, "string");
  assert.equal(corpo.last_used_at, null);
});

test("link por id filtra pela loja", async () => {
  pedidos.length = 0;
  respostas = [{ status: 200, body: [] }];
  assert.equal(await getTrackedLinkById("loja-a", "link-9"), null);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.link-9", limit: "1" });
});
