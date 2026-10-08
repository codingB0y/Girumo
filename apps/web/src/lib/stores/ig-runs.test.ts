import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { claimWaitingRun, countRunsStartedSince, createRun, getRunBySourceId, getWaitingRun, hasRecentRun, listRuns, purgeOldRuns, recordStep, stopActiveRuns, updateRun } from "./ig-runs";

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const linha = { id: "r1", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f1", flow_version: 2, source_kind: "comment", source_id: "c1", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "abcdefghijkl", status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: "2026-10-13T00:00:00Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T00:00:00Z", updated_at: "2026-10-06T00:00:00Z", finished_at: null };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    if (req.method === "HEAD") { res.setHeader("Content-Range", "0-0/3"); res.end(); return; }
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
const novo = { igAccountId: "a1", flowId: "f1", flowVersion: 2, sourceKind: "comment" as const, sourceId: "c1", igUserId: "u1", username: "igortoled0", matchedKeyword: "quero", ref: "abcdefghijkl", windowExpiresAt: "2026-10-13T00:00:00Z" };

test("criar o run grava a loja e nasce na fila; reenvio (23505) volta null", async () => {
  pedidos.length = 0;
  const run = await createRun("loja-a", novo);
  assert.equal(run?.id, "r1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/ig_runs"]);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.source_id, "c1");
  assert.equal(corpo.status, "queued");
  assert.equal(corpo.matched_keyword, "quero");
  proxima = { status: 409, body: { code: "23505", message: 'duplicate key value violates unique constraint "ig_runs_source_uidx"', details: null, hint: null } };
  assert.equal(await createRun("loja-a", novo), null);
  proxima = { status: 409, body: { code: "23505", message: 'duplicate key value violates unique constraint "ig_runs_ref_uidx"', details: null, hint: null } };
  await assert.rejects(() => createRun("loja-a", novo), /ig_runs_ref_uidx/);
});

test("ler por source_id, atualizar e gravar passo filtram a loja", async () => {
  pedidos.length = 0;
  await getRunBySourceId("loja-a", "c1");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", source_id: "eq.c1" });
  await updateRun("loja-a", "r1", { status: "done", node_id: "convite", finished_at: "2026-10-06T00:00:05Z" });
  assert.equal(pedidos[1].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", id: "eq.r1" });
  assert.deepEqual(Object.keys(pedidos[1].corpo as object).sort(), ["finished_at", "node_id", "status", "updated_at"]);
  await recordStep("loja-a", { flowId: "f1", runId: "r1", nodeId: "gatilho", out: "next" });
  assert.deepEqual([pedidos[2].metodo, pedidos[2].url.pathname], ["POST", "/rest/v1/ig_run_steps"]);
  assert.deepEqual(pedidos[2].corpo, { tenant_id: "loja-a", flow_id: "f1", run_id: "r1", node_id: "gatilho", out: "next" });
});

test("teto por conta conta com HEAD; entrada recente por pessoa e fluxo", async () => {
  pedidos.length = 0;
  assert.equal(await countRunsStartedSince("loja-a", "a1", "2026-10-06T00:00:00Z"), 3);
  assert.equal(pedidos[0].metodo, "HEAD");
  assert.match(pedidos[0].prefer, /count=exact/);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", ig_account_id: "eq.a1", started_at: "gte.2026-10-06T00:00:00Z" });
  assert.equal(await hasRecentRun("loja-a", "f1", "u1", "2026-10-05T00:00:00Z"), true);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", flow_id: "eq.f1", ig_user_id: "eq.u1", started_at: "gte.2026-10-05T00:00:00Z", limit: "1" });
});

test("parar runs ativos, listar do fluxo e apagar os velhos filtram a loja", async () => {
  pedidos.length = 0;
  await stopActiveRuns("loja-a", "f1");
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", status: "in.(queued,active)", flow_id: "eq.f1" });
  assert.equal((pedidos[0].corpo as { status: string }).status, "stopped");
  await stopActiveRuns("loja-a");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", status: "in.(queued,active)" });
  const lista = await listRuns("loja-a", "f1");
  assert.equal(lista.length, 1);
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", flow_id: "eq.f1", order: "started_at.desc", limit: "50" });
  await purgeOldRuns("loja-a", "2026-07-08T00:00:00Z");
  assert.equal(pedidos[3].metodo, "DELETE");
  assert.deepEqual(filtros(pedidos[3].url), { tenant_id: "eq.loja-a", started_at: "lt.2026-07-08T00:00:00Z" });
});

test("run esperando resposta: busca pelo id, cai pro @ se não achar; reivindicar só pega quem ainda espera no bloco", async () => {
  pedidos.length = 0;
  assert.equal((await getWaitingRun("loja-a", "a1", "u1", "igortoled0"))?.id, "r1");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", ig_account_id: "eq.a1", status: "eq.active", waiting: "eq.reply", ig_user_id: "eq.u1", order: "updated_at.desc", limit: "1" });
  assert.equal(pedidos.length, 1, "achou pelo id: não procura pelo @");

  pedidos.length = 0;
  proxima = { status: 200, body: [] };
  await getWaitingRun("loja-a", "a1", "u-direct", "igortoled0");
  assert.equal(filtros(pedidos[1].url).username, "eq.igortoled0");

  pedidos.length = 0;
  assert.equal(await claimWaitingRun("loja-a", "r1", "pergunta"), true);
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.r1", status: "eq.active", waiting: "eq.reply", node_id: "eq.pergunta" });
  assert.equal((pedidos[0].corpo as { waiting: unknown }).waiting, null);
  proxima = { status: 200, body: [] };
  assert.equal(await claimWaitingRun("loja-a", "r1", "pergunta"), false);
});
