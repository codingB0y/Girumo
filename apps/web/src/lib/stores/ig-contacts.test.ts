import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { applyContact, contactStats, deleteContact, fieldValues, getContactById, getContactByIgUserId, purgeContacts } from "./ig-contacts";

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const ficha = { id: "p1", tenant_id: "loja-a", ig_user_id: "u1", username: "ana", fields: { tamanho: "Infantil" }, tags: ["vip"], first_seen_at: "2026-11-01T00:00:00Z", last_seen_at: "2026-11-02T00:00:00Z", last_dm_at: null, source_flow_id: null, updated_at: "2026-11-02T00:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? ficha : [ficha]));
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

test("applyContact chama a função atômica com todos os parâmetros e devolve a ficha", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: ficha };
  const linha = await applyContact("loja-a", { igUserId: "u1", username: "ana", set: { tamanho: "Infantil" }, add: ["vip"], seenAt: "2026-11-02T00:00:00Z", dm: true, sourceFlowId: "f1" });
  assert.equal(linha.id, "p1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/rpc/ig_contact_apply"]);
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a", p_ig_user_id: "u1", p_username: "ana", p_set: { tamanho: "Infantil" }, p_add: ["vip"], p_remove: [],
    p_seen_at: "2026-11-02T00:00:00Z", p_dm: true, p_source_flow: "f1",
  });
});

test("applyContact sem campos nem etiquetas manda vazios, não nulos; erro do banco estoura", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: ficha };
  await applyContact("loja-a", { igUserId: "u1", username: null, seenAt: "2026-11-02T00:00:00Z", dm: false });
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a", p_ig_user_id: "u1", p_username: null, p_set: {}, p_add: [], p_remove: [],
    p_seen_at: "2026-11-02T00:00:00Z", p_dm: false, p_source_flow: null,
  });
  proxima = { status: 500, body: { code: "XX000", message: "banco fora", details: null, hint: null } };
  await assert.rejects(() => applyContact("loja-a", { igUserId: "u1", username: null, seenAt: "2026-11-02T00:00:00Z", dm: false }), /banco fora/);
});

test("ler por ig_user_id e por id filtram a loja; ausente volta null", async () => {
  pedidos.length = 0;
  assert.equal((await getContactByIgUserId("loja-a", "u1"))?.username, "ana");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", ig_user_id: "eq.u1" });
  await getContactById("loja-a", "p1");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", id: "eq.p1" });
  proxima = { status: 200, body: [] };
  assert.equal(await getContactById("loja-a", "nao-existe"), null);
});

test("números e valores de campo vêm das funções SQL, com a loja", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: { total: 4, hoje: 3, janela_24h: 1, com_etiqueta: 2, campos: [{ campo: "tamanho", pessoas: 3 }], etiquetas: [{ etiqueta: "vip", pessoas: 2 }] } };
  const s = await contactStats("loja-a");
  assert.deepEqual([s.total, s.hoje, s.janela24h, s.comEtiqueta], [4, 3, 1, 2]);
  assert.deepEqual(s.campos, [{ campo: "tamanho", pessoas: 3 }]);
  assert.deepEqual(s.etiquetas, [{ etiqueta: "vip", pessoas: 2 }]);
  assert.deepEqual([pedidos[0].url.pathname, pedidos[0].corpo], ["/rest/v1/rpc/ig_contact_stats", { p_tenant: "loja-a" }]);

  proxima = { status: 200, body: [{ valor: "P", pessoas: 2 }, { valor: "M", pessoas: 1 }] };
  assert.deepEqual(await fieldValues("loja-a", "tamanho"), [{ valor: "P", pessoas: 2 }, { valor: "M", pessoas: 1 }]);
  assert.deepEqual([pedidos[1].url.pathname, pedidos[1].corpo], ["/rest/v1/rpc/ig_contact_field_values", { p_tenant: "loja-a", p_field: "tamanho" }]);
});

test("números de loja sem nada voltam zerados mesmo se a função devolver parcial", async () => {
  proxima = { status: 200, body: {} };
  assert.deepEqual(await contactStats("loja-a"), { total: 0, hoje: 0, janela24h: 0, comEtiqueta: 0, campos: [], etiquetas: [] });
});

test("apagar a pessoa tira a ficha e os atendimentos dela, sempre com a loja", async () => {
  pedidos.length = 0;
  assert.equal(await deleteContact("loja-a", "p1"), true);
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["DELETE", "/rest/v1/ig_contacts"]);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.p1" });
  assert.deepEqual([pedidos[1].metodo, pedidos[1].url.pathname], ["DELETE", "/rest/v1/ig_runs"]);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", ig_user_id: "eq.u1" });

  pedidos.length = 0;
  proxima = { status: 200, body: [] };
  assert.equal(await deleteContact("loja-a", "nao-existe"), false);
  assert.equal(pedidos.length, 1, "sem ficha não mexe nos atendimentos");
});

test("rotina de prazos chama a função com a hora e devolve as contagens", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: { inativas: 2, loja_cancelada: 5 } };
  assert.deepEqual(await purgeContacts("2026-11-05T12:00:00Z"), { inativas: 2, lojaCancelada: 5 });
  assert.deepEqual([pedidos[0].url.pathname, pedidos[0].corpo], ["/rest/v1/rpc/ig_purge_contacts", { p_now: "2026-11-05T12:00:00Z" }]);
});
