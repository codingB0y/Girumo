import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { getAccount } from "./ig-accounts";
import { deleteFlow, listFlows, publishFlow, updateDraft } from "./ig-flows";

/**
 * O cliente real do Supabase contra um PostgREST de mentira: a query que sai é a
 * de produção, só a rede é trocada. É o que prova, sem banco, o filtro de loja
 * em cada chamada — o service-role passa por cima do RLS.
 */
type Pedido = { metodo: string; url: URL; accept: string; corpo: unknown };
const pedidos: Pedido[] = [];

const linha = { id: "f1", tenant_id: "loja-a", ig_account_id: null, name: "Comentou, entra no grupo", recipe: "comment_invite", status: "draft", draft: { v: 1, nodes: [], edges: [] }, published: null, version: 0, published_at: null, created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    const accept = String(req.headers.accept ?? "");
    pedidos.push({ metodo: req.method ?? "", url, accept, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(accept.includes("pgrst.object") ? linha : [linha]));
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

test("lista só os fluxos da loja, do mais recente", async () => {
  pedidos.length = 0;
  const lista = await listFlows("loja-a");
  assert.equal(lista.length, 1);
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["GET", "/rest/v1/ig_flows"]);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", order: "updated_at.desc", limit: "200" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("draft"), "a lista não carrega o grafo");
});

test("salvar o rascunho e apagar filtram loja E id", async () => {
  pedidos.length = 0;
  await updateDraft("loja-a", "f1", { draft: { v: 1, nodes: [], edges: [] } });
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.f1" });
  assert.deepEqual(Object.keys(pedidos[0].corpo as object).sort(), ["draft", "updated_at"]);
  await deleteFlow("loja-a", "f1");
  assert.equal(pedidos[1].metodo, "DELETE");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", id: "eq.f1" });
});

test("publicar trava por loja, id e versão, e não reescreve o rascunho", async () => {
  pedidos.length = 0;
  await publishFlow("loja-a", "f1", { v: 1, nodes: [], edges: [] }, 3);
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.f1", version: "eq.3" });
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.deepEqual(Object.keys(corpo).sort(), ["published", "published_at", "status", "updated_at", "version"]);
  assert.equal(corpo.version, 4);
  assert.equal(corpo.status, "live");
  assert.ok(!("draft" in corpo), "publicar não pode sobrescrever um autosave do rascunho");
});

test("a conta nunca sai com o token", async () => {
  pedidos.length = 0;
  await getAccount("loja-a");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("access_token"));
});
