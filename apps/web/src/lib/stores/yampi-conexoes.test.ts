import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { EVENTOS_YAMPI } from "@/lib/yampi/tipos";

import {
  atualizarConexaoYampi,
  desconectarConexaoYampi,
  lerConexaoYampi,
  lerConexaoYampiPorId,
  listarConexoesParaConferir,
  marcarCredencialInvalidaNoBanco,
  salvarAvisoYampi,
  salvarConexaoYampi,
} from "./yampi-conexoes";

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
const corpo = (i: number) => pedidos[i].corpo as Record<string, unknown>;

const LINHA = {
  id: "c1", tenant_id: "loja-a", alias: "loja-exemplo", user_token: "v1.a.b.c", user_secret_key: "v1.k.e.y",
  webhook_id: "77", webhook_secret: "v1.d.e.f", status: "ativa", last_event_at: null,
  last_check_at: "2026-10-29T10:00:00+00:00", last_error: null,
};

test("lerConexaoYampi filtra pela loja e mapeia as colunas para o tipo", async () => {
  preparar([200, [LINHA]]);
  const c = await lerConexaoYampi("loja-a");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", limit: "1" });
  assert.deepEqual([c?.id, c?.tenantId, c?.status, c?.userTokenSelado, c?.userSecretKeySelado, c?.webhookId, c?.webhookSecretSelado],
    ["c1", "loja-a", "ativa", "v1.a.b.c", "v1.k.e.y", "77", "v1.d.e.f"]);
  assert.equal(await lerConexaoYampi("loja-a"), null); // o falso devolve [] na segunda
});

test("lerConexaoYampiPorId lê só pelo id (a única leitura sem loja, para o aviso)", async () => {
  preparar([200, [LINHA]]);
  await lerConexaoYampiPorId("c1");
  assert.deepEqual(filtros(0), { id: "eq.c1", limit: "1" });
});

test("salvarConexaoYampi: upsert por tenant_id, status aviso_desativado, aviso e erro zerados, devolve a linha com o id", async () => {
  preparar([200, [LINHA]]);
  const c = await salvarConexaoYampi("loja-a", { alias: "loja-exemplo", userTokenSelado: "v1.t", userSecretKeySelado: "v1.k" });
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "tenant_id");
  assert.deepEqual(corpo(0), {
    tenant_id: "loja-a", alias: "loja-exemplo", user_token: "v1.t", user_secret_key: "v1.k", status: "aviso_desativado",
    webhook_id: null, webhook_secret: null, last_error: null, last_check_at: null,
  });
  assert.equal(c.id, LINHA.id);
});

test("salvarConexaoYampi sem linha de volta lança", async () => {
  preparar([200, []]);
  await assert.rejects(salvarConexaoYampi("loja-a", { alias: "loja-exemplo", userTokenSelado: "v1.t", userSecretKeySelado: "v1.k" }), /não foi gravada/);
});

test("salvarAvisoYampi grava id e segredo selado, os cinco eventos e volta a ativa, filtrando pela loja", async () => {
  preparar([200, []]);
  await salvarAvisoYampi("loja-a", { webhookId: "88", webhookSecretSelado: "v1.s.e.g" });
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a" });
  const c = corpo(0);
  assert.deepEqual([c.webhook_id, c.webhook_secret, c.status, c.last_error], ["88", "v1.s.e.g", "ativa", null]);
  assert.deepEqual(c.events, [...EVENTOS_YAMPI]);
  assert.ok(!Number.isNaN(Date.parse(String(c.last_check_at))));
});

test("marcarCredencialInvalidaNoBanco só muda ativa e aviso_desativado e devolve se mudou", async () => {
  preparar([200, [{ tenant_id: "loja-a" }]], [200, []]);
  assert.equal(await marcarCredencialInvalidaNoBanco("loja-a", "x"), true);
  assert.equal(await marcarCredencialInvalidaNoBanco("loja-a", "x"), false);
  assert.deepEqual([filtros(0).tenant_id, filtros(0).status], ["eq.loja-a", "in.(ativa,aviso_desativado)"]);
  assert.equal(corpo(0).status, "credencial_invalida");
  assert.equal(corpo(0).last_error, "x");
});

test("desconectarConexaoYampi devolve a conexão de antes e apaga credenciais e aviso; sem linha devolve null", async () => {
  preparar([200, [LINHA]], [200, []]);
  const antes = await desconectarConexaoYampi("loja-a");
  assert.equal(antes?.webhookId, "77");
  assert.equal(pedidos[1].metodo, "PATCH");
  assert.deepEqual(filtros(1), { tenant_id: "eq.loja-a" });
  assert.deepEqual(corpo(1), { status: "desconectada", user_token: null, user_secret_key: null, webhook_id: null, webhook_secret: null });
  preparar([200, []]);
  assert.equal(await desconectarConexaoYampi("loja-a"), null);
  assert.equal(pedidos.length, 1);
});

test("listarConexoesParaConferir: ativas ou com aviso desligado, sem checagem desde o corte, as mais antigas primeiro, no limite", async () => {
  preparar([200, [{ tenant_id: "loja-a" }, { tenant_id: "loja-b" }]]);
  const corte = new Date("2026-10-29T09:00:00Z");
  assert.deepEqual(await listarConexoesParaConferir(corte, 20), ["loja-a", "loja-b"]);
  assert.deepEqual(filtros(0), {
    status: "in.(ativa,aviso_desativado)",
    or: `(last_check_at.is.null,last_check_at.lt.${corte.toISOString()})`,
    order: "last_check_at.asc.nullsfirst",
    limit: "20",
  });
});

test("erro do PostgREST vira exceção com a mensagem dele", async () => {
  preparar([500, { code: "XX000", message: "banco fora do ar", details: null, hint: null }]);
  await assert.rejects(atualizarConexaoYampi("loja-a", { last_error: null }), /banco fora do ar/);
});

test("toda função com loja manda tenant_id=eq.<loja> (CLAUDE.md: o service-role não passa pelo RLS)", async () => {
  preparar([200, [LINHA]], [200, [LINHA]], [200, []], [200, []], [200, []], [200, [LINHA]], [200, []]);
  await lerConexaoYampi("loja-z");
  await salvarConexaoYampi("loja-z", { alias: "loja-exemplo", userTokenSelado: "v1.t", userSecretKeySelado: "v1.k" });
  await salvarAvisoYampi("loja-z", { webhookId: "1", webhookSecretSelado: "v1.s" });
  await atualizarConexaoYampi("loja-z", { last_event_at: new Date().toISOString() });
  await marcarCredencialInvalidaNoBanco("loja-z", "x");
  await desconectarConexaoYampi("loja-z");
  for (const p of pedidos) {
    const comLoja = p.url.searchParams.get("tenant_id") === "eq.loja-z" || (p.corpo as { tenant_id?: string } | null)?.tenant_id === "loja-z";
    assert.ok(comLoja, `${p.metodo} ${p.url.search}`);
  }
  assert.equal(pedidos.length, 7);
});
