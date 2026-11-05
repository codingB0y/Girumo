import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { CannedRepliesLimitError, createCannedReply, deleteCannedReply, listCannedReplies } from "./ig-canned-replies";

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const resposta = { id: "p1", tenant_id: "loja-a", title: "Prazo", text: "Enviamos em 2 dias úteis.", created_at: "2026-11-06T00:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? resposta : [resposta]));
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

test("listar filtra a loja e vem na ordem de criação", async () => {
  pedidos.length = 0;
  assert.equal((await listCannedReplies("loja-a")).length, 1);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", order: "created_at.asc", limit: "50" });
});

test("criar grava a loja com título e texto aparados; a 51ª vira erro tipado", async () => {
  pedidos.length = 0;
  const r = await createCannedReply("loja-a", { title: "  Prazo ", text: " Enviamos em 2 dias úteis. " });
  assert.equal(r.id, "p1");
  assert.deepEqual(pedidos[0].corpo, { tenant_id: "loja-a", title: "Prazo", text: "Enviamos em 2 dias úteis." });
  proxima = { status: 400, body: { code: "P0001", message: "ig_canned_replies_limit", details: null, hint: null } };
  await assert.rejects(() => createCannedReply("loja-a", { title: "x", text: "y" }), CannedRepliesLimitError);
  proxima = { status: 500, body: { code: "XX000", message: "banco fora", details: null, hint: null } };
  await assert.rejects(() => createCannedReply("loja-a", { title: "x", text: "y" }), /banco fora/);
});

test("apagar filtra loja e id; true só quando apagou alguma", async () => {
  pedidos.length = 0;
  assert.equal(await deleteCannedReply("loja-a", "p1"), true);
  assert.equal(pedidos[0].metodo, "DELETE");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.p1" });
  proxima = { status: 200, body: [] };
  assert.equal(await deleteCannedReply("loja-b", "p1"), false);
});
