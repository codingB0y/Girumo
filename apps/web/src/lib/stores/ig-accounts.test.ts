import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { getAccountByProviderId, setAccountStatus, upsertAccount } from "./ig-accounts";
import { pauseLiveFlows } from "./ig-flows";

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const linha = { id: "a1", tenant_id: "loja-a", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "2026-10-06T00:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? linha : [linha]));
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

test("conectar grava uma conta por loja, sem token, com o id da Zernio no ig_user_id", async () => {
  pedidos.length = 0;
  const conta = await upsertAccount("loja-a", { providerAccountId: "z1", providerProfileId: "p1", username: "vireimoda" });
  assert.equal(conta?.id, "a1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/ig_accounts"]);
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "tenant_id");
  assert.match(pedidos[0].prefer, /resolution=merge-duplicates/);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.provider_account_id, "z1");
  assert.equal(corpo.ig_user_id, "zernio:z1");
  assert.equal(corpo.status, "active");
  assert.ok(!("access_token_enc" in corpo));
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("access_token_enc"));
});

test("a mesma conta da Zernio em outra loja (23505) volta null em vez de estourar", async () => {
  pedidos.length = 0;
  proxima = { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint", details: null, hint: null } };
  assert.equal(await upsertAccount("loja-b", { providerAccountId: "z1", providerProfileId: "p2", username: "vireimoda" }), null);
});

test("o webhook acha a loja pelo id da conta na Zernio (única leitura sem tenant)", async () => {
  pedidos.length = 0;
  const conta = await getAccountByProviderId("z1");
  assert.equal(conta?.tenant_id, "loja-a");
  assert.deepEqual(filtros(pedidos[0].url), { provider_account_id: "eq.z1" });
  assert.ok(pedidos[0].url.searchParams.get("select")?.includes("tenant_id"));
});

test("mudar o estado da conta e pausar os fluxos no ar filtram a loja", async () => {
  pedidos.length = 0;
  await setAccountStatus("loja-a", "disconnected", null);
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
  assert.deepEqual(Object.keys(pedidos[0].corpo as object).sort(), ["last_error", "status", "updated_at"]);
  await pauseLiveFlows("loja-a");
  assert.deepEqual([pedidos[1].metodo, pedidos[1].url.pathname], ["PATCH", "/rest/v1/ig_flows"]);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", status: "eq.live" });
  assert.equal((pedidos[1].corpo as { status: string }).status, "paused");
});
