import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { bulkTags, collectContacts, editContact, escapeLike, LimiteDeVarredura, listContacts, LIMITE_VARREDURA } from "./ig-contacts-lista";

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
/** Quantas linhas o "banco" tem no total; o fake devolve fichas numeradas dentro do `range` pedido. */
let totalNoBanco = 0;

const ficha = (n: number) => ({ id: `p${n}`, tenant_id: "loja-a", ig_user_id: `u${n}`, username: `ana${n}`, fields: {}, tags: [], first_seen_at: "2026-11-01T00:00:00Z", last_seen_at: "2026-11-02T00:00:00Z", last_dm_at: null, source_flow_id: null, updated_at: "2026-11-02T00:00:00Z" });

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.startsWith("/rest/v1/rpc/")) { res.end(JSON.stringify(ficha(1))); return; }
    // `.range(a, b)` do supabase-js vira offset + limit na URL.
    const de = Number(url.searchParams.get("offset") ?? 0);
    const limite = url.searchParams.get("limit");
    const ate = Math.min(limite ? de + Number(limite) - 1 : totalNoBanco - 1, totalNoBanco - 1);
    const head = req.method === "HEAD";
    res.setHeader("Content-Range", `${head ? "*" : `${de}-${ate}`}/${totalNoBanco}`);
    if (head) { res.end(); return; }
    res.end(JSON.stringify(Array.from({ length: Math.max(0, ate - de + 1) }, (_, i) => ficha(de + i))));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const AGORA = Date.parse("2026-11-05T12:00:00Z");

test("escapeLike tira o @ e neutraliza os curingas", () => {
  assert.equal(escapeLike("@ana_%"), "ana\\_\\%");
  assert.equal(escapeLike(" a*b "), "ab");
});

test("listContacts filtra a loja, aplica todos os filtros e conta à parte com head", async () => {
  pedidos.length = 0;
  totalNoBanco = 120;
  const r = await listContacts("loja-a", { q: "@an_a", tags: ["vip", "atacado"], field: { key: "tamanho", value: "Infantil" }, recencia: "7d" }, 2, AGORA);
  assert.equal(r.total, 120);
  assert.equal(r.rows.length, 50, "página 2 = linhas 50..99");
  const lista = pedidos.find((p) => p.metodo === "GET");
  const contagem = pedidos.find((p) => p.metodo === "HEAD");
  assert.ok(lista && contagem, "uma leitura da página e uma contagem à parte");
  for (const p of [lista, contagem]) {
    assert.equal(p.url.searchParams.get("tenant_id"), "eq.loja-a");
    assert.equal(p.url.searchParams.get("username"), "ilike.%an\\_a%");
    assert.equal(p.url.searchParams.get("tags"), "cs.{vip,atacado}");
    assert.equal(p.url.searchParams.get("fields->>tamanho"), "eq.Infantil");
    assert.equal(p.url.searchParams.get("last_seen_at"), `gte.${new Date(AGORA - 7 * 86_400_000).toISOString()}`);
  }
  assert.equal(lista.url.searchParams.get("order"), "last_seen_at.desc,id.asc");
});

test("chave de campo inválida não entra no nome da coluna", async () => {
  pedidos.length = 0;
  totalNoBanco = 0;
  await listContacts("loja-a", { field: { key: "a'; drop", value: "x" } }, 1, AGORA);
  assert.ok(pedidos.every((p) => ![...p.url.searchParams.keys()].some((k) => k.startsWith("fields"))));
});

test("collectContacts anda de 1000 em 1000 até acabar, sem cortar em silêncio", async () => {
  pedidos.length = 0;
  totalNoBanco = 2300;
  const todas = await collectContacts("loja-a", {}, AGORA);
  assert.equal(todas.length, 2300);
  assert.equal(pedidos.filter((p) => p.metodo === "GET").length, 3);
});

test("collectContacts acima do teto estoura com erro explícito", async () => {
  totalNoBanco = LIMITE_VARREDURA + 1;
  await assert.rejects(() => collectContacts("loja-a", {}, AGORA), LimiteDeVarredura);
});

test("editContact grava com a hora que a ficha já tem e sem marcar direct", async () => {
  pedidos.length = 0;
  await editContact("loja-a", ficha(1), { set: { tamanho: null }, add: ["vip"] });
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a", p_ig_user_id: "u1", p_username: "ana1", p_set: { tamanho: null }, p_add: ["vip"], p_remove: [],
    p_seen_at: "2026-11-02T00:00:00Z", p_dm: false, p_source_flow: null,
  });
});

test("bulkTags por ids lê só da loja e grava uma ficha por vez no apply atômico", async () => {
  pedidos.length = 0;
  totalNoBanco = 3;
  const n = await bulkTags("loja-a", { ids: ["p0", "p1", "p2"] }, ["quente"], ["frio"], AGORA);
  assert.equal(n, 3);
  const leitura = pedidos.find((p) => p.metodo === "GET");
  assert.equal(leitura?.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.match(leitura?.url.searchParams.get("id") ?? "", /^in\./);
  const aplicacoes = pedidos.filter((p) => p.url.pathname === "/rest/v1/rpc/ig_contact_apply");
  assert.equal(aplicacoes.length, 3);
  assert.ok(aplicacoes.every((p) => (p.corpo as { p_add: string[]; p_remove: string[] }).p_add[0] === "quente" && (p.corpo as { p_remove: string[] }).p_remove[0] === "frio"));
});

test("bulkTags por filtro lê tudo ANTES de gravar (paginar enquanto muda etiqueta embaralharia)", async () => {
  pedidos.length = 0;
  totalNoBanco = 1200;
  const n = await bulkTags("loja-a", { filtros: { tags: ["vip"] } }, ["novo"], [], AGORA);
  assert.equal(n, 1200);
  const ultimaLeitura = pedidos.map((p) => p.metodo).lastIndexOf("GET");
  const primeiraGravacao = pedidos.findIndex((p) => p.url.pathname.startsWith("/rest/v1/rpc/"));
  assert.ok(ultimaLeitura < primeiraGravacao);
});
