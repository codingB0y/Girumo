import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import {
  gravarEventoYampi,
  lerEventoYampi,
  limparDadosVencidosComuns,
  listarEventosParados,
  marcarEventoComErro,
  marcarEventoProcessado,
} from "./yampi-eventos";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de bling-conexoes.test.ts). */

type Pedido = { metodo: string; url: URL; corpo: unknown; headers: IncomingHttpHeaders };
const pedidos: Pedido[] = [];
let respostas: { status: number; body: unknown }[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null, headers: req.headers });
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

function preparar(...lista: Array<[number, unknown]>): void {
  pedidos.length = 0;
  respostas = lista.map(([status, body]) => ({ status, body }));
}
const filtros = (i: number) => Object.fromEntries([...pedidos[i].url.searchParams].filter(([k]) => k !== "select"));
const todos = (i: number, chave: string) => pedidos[i].url.searchParams.getAll(chave);
const corpo = (i: number) => pedidos[i].corpo as Record<string, unknown>;

const EVENTO = { tenantId: "loja-a", connectionId: "c1", event: "order.paid", resourceId: "42", dedupeKey: "c1:abc", payload: { event: "order.paid" } };

test("gravarEventoYampi ignora a repetição pela dedupe_key e devolve o id só quando entrou", async () => {
  preparar([200, [{ id: "e1" }]], [200, []]);
  assert.deepEqual(await gravarEventoYampi(EVENTO), { id: "e1" });
  assert.equal(await gravarEventoYampi(EVENTO), null);
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "dedupe_key");
  assert.match(String(pedidos[0].headers.prefer), /resolution=ignore-duplicates/);
  assert.deepEqual(corpo(0), { tenant_id: "loja-a", connection_id: "c1", event: "order.paid", resource_id: "42", dedupe_key: "c1:abc", payload: { event: "order.paid" } });
});

test("marcarEventoProcessado e marcarEventoComErro filtram por id E loja; o erro é cortado em 300; só o processado preenche processed_at", async () => {
  preparar([200, []], [200, []], [200, []]);
  await marcarEventoProcessado("loja-a", "e1");
  await marcarEventoProcessado("loja-a", "e1", "conexão ausente");
  await marcarEventoComErro("loja-a", "e1", "x".repeat(400));
  for (const i of [0, 1, 2]) assert.deepEqual(filtros(i), { id: "eq.e1", tenant_id: "eq.loja-a" });
  assert.ok(!Number.isNaN(Date.parse(String(corpo(0).processed_at))));
  assert.equal(corpo(0).error, null);
  assert.equal(corpo(1).error, "conexão ausente");
  assert.deepEqual(Object.keys(corpo(2)), ["error"]);
  assert.equal(String(corpo(2).error).length, 300);
});

test("listarEventosParados: sem processar, entre depoisDe e antesDe, os mais antigos primeiro", async () => {
  preparar([200, [{ id: "e1" }, { id: "e2" }]]);
  const antesDe = new Date("2026-10-29T10:00:00Z");
  const depoisDe = new Date("2026-10-28T10:00:00Z");
  assert.deepEqual(await listarEventosParados({ antesDe, depoisDe, limite: 50 }), ["e1", "e2"]);
  assert.equal(filtros(0).processed_at, "is.null");
  assert.deepEqual(todos(0, "received_at").sort(), [`gt.${depoisDe.toISOString()}`, `lt.${antesDe.toISOString()}`].sort());
  assert.equal(filtros(0).order, "received_at.asc");
  assert.equal(filtros(0).limit, "50");
});

test("lerEventoYampi lê por id e mapeia o payload sem tocar nele; limparDadosVencidosComuns chama a função pública e devolve o número", async () => {
  const payload = { event: "order.paid", resource: { id: 42, customer: { phone: "5511999990000" } } };
  preparar(
    [200, [{ id: "e1", tenant_id: "loja-a", connection_id: "c1", event: "order.paid", resource_id: "42", payload, received_at: "2026-10-29T10:00:00+00:00", processed_at: null, error: null }]],
    [200, 7],
  );
  const e = await lerEventoYampi("e1");
  assert.deepEqual(filtros(0), { id: "eq.e1", limit: "1" });
  assert.deepEqual([e?.tenantId, e?.connectionId, e?.processedAt], ["loja-a", "c1", null]);
  assert.deepEqual(e?.payload, payload);
  assert.equal(await limparDadosVencidosComuns(), 7);
  assert.equal(`${pedidos[1].metodo} ${pedidos[1].url.pathname}`, "POST /rest/v1/rpc/limpar_dados_vencidos_comuns");
});

test("toda função com loja manda tenant_id=eq.<loja> (CLAUDE.md: o service-role não passa pelo RLS)", async () => {
  preparar([200, [{ id: "e1" }]], [200, []], [200, []]);
  await gravarEventoYampi({ ...EVENTO, tenantId: "loja-z" });
  await marcarEventoProcessado("loja-z", "e1");
  await marcarEventoComErro("loja-z", "e1", "x");
  for (const p of pedidos) {
    const comLoja = p.url.searchParams.get("tenant_id") === "eq.loja-z" || (p.corpo as { tenant_id?: string } | null)?.tenant_id === "loja-z";
    assert.ok(comLoja, `${p.metodo} ${p.url.search}`);
  }
});
