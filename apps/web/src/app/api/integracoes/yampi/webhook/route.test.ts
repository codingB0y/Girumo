import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import { selar } from "@/lib/security/secret-box";
import { contextoDoSegredo } from "@/lib/yampi/credenciais";
import { LIMITE_CORPO_AVISO } from "@/lib/yampi/envelope";

/**
 * O aviso de ponta a ponta: a rota real e as stores reais falando com um PostgREST de mentira que registra cada
 * chamada — é por ele que se prova que aviso forjado não grava nada. O processamento que a rota agenda no
 * `after()` só é entregue ao teste (molde de `bling/webhook/route.test.ts`).
 */

// O escopo de requisição do Next lê este global uma vez, quando carrega: antes do import da rota.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let rota: typeof import("./route");
let noEscopo: (handler: () => Promise<Response>) => Promise<Response>;
const tarefasDepois: unknown[] = [];
const POST = (req: Request) => noEscopo(() => rota.POST(req));

type Chamada = { metodo: string; url: URL; corpo: unknown };
const banco: Chamada[] = [];

const CHAVE = Buffer.alloc(32, 7);
const SEGREDO = "segredo-do-aviso";
const SEGREDO_B = "segredo-da-outra-conexao";
const CONEXAO_ID = "11111111-1111-4111-8111-111111111111";
const OUTRA_ID = "22222222-2222-4222-8222-222222222222";

type Linha = Record<string, unknown>;
let conexoes: Record<string, Linha> = {};
let gravacao: "nova" | "repetida" | "falha" = "nova";
let eventoGravado: Linha | null = null;

function conexao(id: string, tenant: string, segredo: string, extra: Linha = {}): Linha {
  return {
    id, tenant_id: tenant, alias: "loja-exemplo", user_token: "v1.a.b.c", user_secret_key: "v1.d.e.f", webhook_id: "77",
    webhook_secret: selar(segredo, contextoDoSegredo(tenant, "webhook_secret"), CHAVE), status: "ativa",
    last_event_at: null, last_check_at: null, last_error: null, ...extra,
  };
}

function responder(metodo: string, url: URL, corpo: unknown): [number, unknown] {
  const rotaDoBanco = `${metodo} ${url.pathname}`;
  if (rotaDoBanco === "GET /rest/v1/yampi_connections") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
    return [200, conexoes[id] ? [conexoes[id]] : []];
  }
  if (rotaDoBanco === "PATCH /rest/v1/yampi_connections") return [200, []];
  if (rotaDoBanco === "POST /rest/v1/yampi_events") {
    if (gravacao === "falha") return [500, { code: "XX000", message: "banco fora do ar", details: null, hint: null }];
    if (gravacao === "repetida") return [200, []];
    eventoGravado = { id: "e1", ...(corpo as Linha), received_at: new Date().toISOString(), processed_at: null, error: null };
    return [200, [{ id: "e1" }]];
  }
  if (rotaDoBanco === "GET /rest/v1/yampi_events") return [200, eventoGravado ? [eventoGravado] : []];
  if (rotaDoBanco === "PATCH /rest/v1/yampi_events") return [200, []];
  return [500, { message: `inesperado: ${rotaDoBanco}` }];
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpo = bruto ? JSON.parse(bruto) : undefined;
    banco.push({ metodo: req.method ?? "", url, corpo });
    const [status, resposta] = responder(req.method ?? "", url, corpo);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(resposta));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const escopo = { afterContext: { after: (tarefa: unknown) => void tarefasDepois.push(tarefa) } } as unknown as WorkStore;
  noEscopo = (handler) => workAsyncStorage.run(escopo, handler);
  rota = await import("./route");
});
beforeEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = CHAVE.toString("base64");
  tarefasDepois.length = 0;
  banco.length = 0;
  conexoes = { [CONEXAO_ID]: conexao(CONEXAO_ID, "loja-a", SEGREDO), [OUTRA_ID]: conexao(OUTRA_ID, "loja-b", SEGREDO_B) };
  gravacao = "nova";
  eventoGravado = null;
});
after(() => {
  supabase.close();
});

// --- Ajudantes ---------------------------------------------------------------------------

type Corpo = Uint8Array<ArrayBuffer> | string;
const URL_DO_AVISO = (c: string = CONEXAO_ID) => `http://girumo.test/api/integracoes/yampi/webhook?c=${c}`;
const hmac = (corpo: Corpo, segredo = SEGREDO) => createHmac("sha256", segredo).update(corpo).digest("base64");
const pedido = (corpo: Corpo, cabecalhos: Record<string, string> = {}, c?: string) =>
  new Request(URL_DO_AVISO(c), { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: corpo });
const assinado = (corpo: Corpo, segredo = SEGREDO, c: string = CONEXAO_ID) => pedido(corpo, { "x-yampi-hmac-sha256": hmac(corpo, segredo) }, c);
const aviso = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: "order.paid", time: "2026-10-29 10:00:00", merchant: { id: 1, alias: "loja-exemplo" },
    resource: { id: 42, customer: { phone: "5511999990000", pix_qr_code: "000201PIXSECRETO" } }, ...extra,
  });

const rotas = () => [...new Set(banco.map((c) => `${c.metodo} ${c.url.pathname}`))];
const gravacoes = () => banco.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/yampi_events");
const patchesDaConexao = () => banco.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections");
const patchesDoEvento = () => banco.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_events");

// --- Casos -------------------------------------------------------------------------------

test("assinatura errada, malformada ou ausente: 401 e só a leitura da conexão vai ao banco", async (t) => {
  t.mock.method(console, "warn", () => {});
  const corpo = aviso();
  for (const cab of [hmac(corpo, "outro-segredo"), hmac(corpo).slice(0, 20), "", null]) {
    const r = await POST(pedido(corpo, cab === null ? {} : { "x-yampi-hmac-sha256": cab }));
    assert.equal(r.status, 401, String(cab));
    assert.deepEqual(await r.json(), { error: "assinatura" });
  }
  assert.deepEqual(rotas(), ["GET /rest/v1/yampi_connections"]);
  assert.equal(tarefasDepois.length, 0);
});

test("assinatura de outra conexão no ?c errado: 401", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal((await POST(assinado(aviso(), SEGREDO, OUTRA_ID))).status, 401); // assinado com o segredo da A, enviado para a B
  assert.equal(gravacoes().length, 0);
  assert.equal((await POST(assinado(aviso(), SEGREDO, CONEXAO_ID))).status, 200);
});

test("conexão desconhecida, desconectada ou sem segredo, ou ?c que não é uuid: 401 — o ?c inválido nem consulta o banco", async () => {
  for (const c of ["", "nao-e-uuid", "1' or '1'='1", `${CONEXAO_ID}x`]) {
    assert.equal((await POST(assinado(aviso(), SEGREDO, c))).status, 401, c);
  }
  assert.equal(banco.length, 0);
  assert.equal((await POST(new Request("http://girumo.test/api/integracoes/yampi/webhook", { method: "POST", body: aviso() }))).status, 401);
  assert.equal(banco.length, 0);

  const desconhecida = "33333333-3333-4333-8333-333333333333";
  assert.equal((await POST(assinado(aviso(), SEGREDO, desconhecida))).status, 401);
  conexoes[CONEXAO_ID] = conexao(CONEXAO_ID, "loja-a", SEGREDO, { status: "desconectada" });
  assert.equal((await POST(assinado(aviso()))).status, 401);
  conexoes[CONEXAO_ID] = conexao(CONEXAO_ID, "loja-a", SEGREDO, { webhook_secret: null });
  assert.equal((await POST(assinado(aviso()))).status, 401);
  assert.deepEqual(rotas(), ["GET /rest/v1/yampi_connections"]);
  assert.equal(tarefasDepois.length, 0);
});

test("corpo acima do limite: 413 pelo content-length (sem ler o corpo) e pelo tamanho lido; no limite, entra", async () => {
  const declarado = pedido("{}", { "content-length": String(LIMITE_CORPO_AVISO + 1) });
  assert.equal((await POST(declarado)).status, 413);
  assert.equal(declarado.bodyUsed, false, "recusa antes de ler o corpo");

  // Sem content-length (chunked): o tamanho lido decide, antes de tocar no banco.
  assert.equal((await POST(assinado("x".repeat(LIMITE_CORPO_AVISO + 1)))).status, 413);
  assert.equal(banco.length, 0);

  const base = aviso({ pad: "" });
  const noLimite = aviso({ pad: "x".repeat(LIMITE_CORPO_AVISO - Buffer.byteLength(base)) });
  assert.equal(Buffer.byteLength(noLimite), LIMITE_CORPO_AVISO);
  assert.equal((await POST(assinado(noLimite))).status, 200);
  assert.equal(gravacoes().length, 1);
});

test("sem a chave de cifra: 503 e o banco não é tocado", async (t) => {
  t.mock.method(console, "error", () => {});
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  const r = await POST(assinado(aviso()));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "indisponivel" });
  assert.equal(banco.length, 0);
});

test("segredo que não abre (chave trocada): 500 sem gravar", async (t) => {
  t.mock.method(console, "error", () => {});
  process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  assert.equal((await POST(assinado(aviso()))).status, 500);
  assert.equal(gravacoes().length, 0);
});

test("alias do envelope diferente do da conexão, mesmo com a assinatura certa: 401 e nada gravado; maiúsculas não contam", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal((await POST(assinado(aviso({ merchant: { id: 1, alias: "outra-loja" } })))).status, 401);
  assert.equal(gravacoes().length, 0);
  assert.equal((await POST(assinado(aviso({ merchant: { id: 1, alias: "LOJA-EXEMPLO" } })))).status, 200);
  assert.equal(gravacoes().length, 1);
});

test("assinado mas fora dos cinco eventos, ou JSON quebrado: 200 e nada gravado", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const erros = t.mock.method(console, "error", () => {});
  for (const corpo of [aviso({ event: "product.updated" }), "{não é json"]) {
    const r = await POST(assinado(corpo));
    assert.equal(r.status, 200, corpo);
    assert.deepEqual(await r.json(), { ok: true });
  }
  assert.equal(gravacoes().length, 0);
  assert.equal(tarefasDepois.length, 0);
  assert.match(avisos.mock.calls.map((c) => String(c.arguments[0])).join("\n"), /outro_evento/);
  assert.doesNotMatch(erros.mock.calls.map((c) => String(c.arguments[0])).join("\n"), /não é json/);
});

test("aviso válido: grava (tenant, conexão, event, resource_id, dedupe_key, payload), marca last_event_at, responde 200 e agenda o processamento", async () => {
  const corpo = aviso();
  const r = await POST(assinado(corpo));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const [gravou] = gravacoes();
  const linha = gravou.corpo as Record<string, unknown>;
  assert.deepEqual(Object.keys(linha).sort(), ["connection_id", "dedupe_key", "event", "payload", "resource_id", "tenant_id"]);
  assert.deepEqual([linha.tenant_id, linha.connection_id, linha.event, linha.resource_id], ["loja-a", CONEXAO_ID, "order.paid", "42"]);
  assert.match(String(linha.dedupe_key), new RegExp(`^${CONEXAO_ID}:[0-9a-f]{64}$`));
  assert.deepEqual(linha.payload, JSON.parse(corpo));
  assert.equal(gravou.url.searchParams.get("on_conflict"), "dedupe_key");
  const [patch] = patchesDaConexao();
  assert.equal(patch?.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.deepEqual(Object.keys(patch?.corpo as object), ["last_event_at"]);
  assert.equal(tarefasDepois.length, 1);
});

test("responde sem esperar o processamento: nada além da gravação acontece antes do after()", async () => {
  await POST(assinado(aviso()));
  assert.equal(patchesDoEvento().length, 0);
  await (tarefasDepois[0] as () => Promise<void>)(); // roda o after(): lê o evento e o marca processado (nenhum consumidor)
  const [marcou] = patchesDoEvento();
  assert.deepEqual([marcou?.url.searchParams.get("id"), marcou?.url.searchParams.get("tenant_id")], ["eq.e1", "eq.loja-a"]);
  assert.ok((marcou?.corpo as { processed_at?: string }).processed_at);
});

test("aviso repetido (o banco ignora a dedupe_key): 200 e nada agendado", async () => {
  gravacao = "repetida";
  const r = await POST(assinado(aviso()));
  assert.equal(r.status, 200);
  assert.equal(tarefasDepois.length, 0);
  assert.equal(patchesDaConexao().length, 0);
});

test("banco fora ao gravar: 500, sem agendar e sem marcar last_event_at", async (t) => {
  t.mock.method(console, "error", () => {});
  gravacao = "falha";
  const r = await POST(assinado(aviso()));
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "tente de novo" });
  assert.equal(tarefasDepois.length, 0);
  assert.equal(patchesDaConexao().length, 0);
});

test("a assinatura vale sobre os bytes crus: corpo com BOM confere", async () => {
  const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(aviso())]);
  assert.equal((await POST(assinado(bom))).status, 200);
  assert.equal(gravacoes().length, 1);
});

test("o log nunca leva corpo, telefone, código Pix nem segredo", async (t) => {
  const logs = [t.mock.method(console, "warn", () => {}), t.mock.method(console, "error", () => {})];
  await POST(pedido(aviso(), { "x-yampi-hmac-sha256": hmac(aviso(), "outro-segredo") })); // 401 por assinatura
  await POST(assinado("{corpo-quebrado-secreto")); // assinado mas não é JSON
  gravacao = "falha";
  await POST(assinado(aviso())); // banco fora ao gravar um aviso válido
  const logado = logs.flatMap((l) => l.mock.calls.map((c) => c.arguments.join(" "))).join("\n");
  assert.doesNotMatch(logado, /5511999990000|PIXSECRETO|segredo-do-aviso|corpo-quebrado-secreto/);
  assert.match(logado, new RegExp(CONEXAO_ID)); // o id da conexão (e o nome do evento) podem aparecer
});
