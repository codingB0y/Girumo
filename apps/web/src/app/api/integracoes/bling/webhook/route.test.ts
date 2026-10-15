import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import { LIMITE_CORPO_AVISO } from "@/lib/bling/aviso";
import type { Resultado } from "@/lib/bling/sincronizar";

/**
 * O aviso de ponta a ponta: a rota real e as stores reais falando com um PostgREST de mentira
 * que registra cada chamada — é por ele que se prova que assinatura errada não toca no banco.
 * A sincronização que a rota agenda no `after()` só é entregue ao teste.
 */

// O escopo de requisição do Next lê este global uma vez, quando carrega: antes do import da rota.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let rota: typeof import("./route");
let noEscopo: (handler: () => Promise<Response>) => Promise<Response>;
const tarefasDepois: unknown[] = [];
const POST = (req: Request) => noEscopo(() => rota.POST(req));

type Chamada = { metodo: string; url: URL; corpo: unknown };
const banco: Chamada[] = [];
let conexaoDaEmpresa: Record<string, unknown> | null = null;
let filaFalha = false;

const SEGREDO = "segredo-do-app";
const URL_DO_AVISO = "http://girumo.test/api/integracoes/bling/webhook";

function conexao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: "loja-a", company_id: "empresa-1", company_name: "Moda da Ana", status: "ativa",
    access_token_enc: "v1.a.b.c", refresh_token_enc: "v1.d.e.f", access_expires_at: null, token_version: 3,
    situations: [], situations_at: null, sale_situation_ids: [9], high_value: null, meta_enabled: true,
    meta_campaign_id: null, backfill_from: "2026-07-15", backfill_until: "2026-10-12", backfill_page: 1,
    backfill_done_at: null, scan_cursor: null, paused_until: null, consecutive_failures: 0,
    last_webhook_at: null, last_scan_at: null, last_scan_change_at: null, last_sale_at: null, last_error: null,
    last_error_at: null, reconnect_alerted_at: null, connected_at: "2026-10-13T12:00:00+00:00",
    ...extra,
  };
}

function responder(metodo: string, url: URL): [number, unknown] {
  const rotaDoBanco = `${metodo} ${url.pathname}`;
  if (rotaDoBanco === "GET /rest/v1/bling_connections") {
    const empresa = url.searchParams.get("company_id")?.replace(/^eq\./, "");
    return [200, conexaoDaEmpresa && conexaoDaEmpresa.company_id === empresa ? [conexaoDaEmpresa] : []];
  }
  if (rotaDoBanco === "POST /rest/v1/rpc/bling_enqueue") {
    return filaFalha ? [500, { code: "XX000", message: "banco fora do ar", details: null, hint: null }] : [200, 1];
  }
  if (rotaDoBanco === "PATCH /rest/v1/bling_connections") return [200, []];
  // A drenagem acha a trava ocupada: o teste só lê o orçamento pelos segundos pedidos.
  if (rotaDoBanco === "POST /rest/v1/rpc/bling_claim") return [200, false];
  return [500, { message: `inesperado: ${rotaDoBanco}` }];
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    banco.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    const [status, resposta] = responder(req.method ?? "", url);
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
  process.env.BLING_CLIENT_ID = "app-girumo";
  process.env.BLING_CLIENT_SECRET = SEGREDO;
  // Sem a chave de cifra a sincronização agendada para na hora, sem banco: o teste a roda sem efeito.
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  tarefasDepois.length = 0;
  banco.length = 0;
  conexaoDaEmpresa = conexao();
  filaFalha = false;
});
after(() => {
  supabase.close();
});

// --- Ajudantes ---------------------------------------------------------------------------

function assinatura(corpo: Uint8Array | string, segredo = SEGREDO): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

function texto(dados: unknown): string {
  return JSON.stringify(dados);
}

function aviso(extra: Record<string, unknown> = {}): string {
  return texto({ eventId: "evt-1", date: "2026-10-13T15:00:00Z", version: "v1", event: "order.created", companyId: "empresa-1", data: { id: 123 }, ...extra });
}

type Corpo = Uint8Array<ArrayBuffer> | string;

function pedido(corpo: Corpo, cabecalhos: Record<string, string> = {}): Request {
  return new Request(URL_DO_AVISO, { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: corpo });
}

function assinado(corpo: Corpo): Request {
  return pedido(corpo, { "x-bling-signature-256": assinatura(corpo) });
}

const chamadasRpc = () => banco.filter((c) => c.url.pathname === "/rest/v1/rpc/bling_enqueue");
const travasPedidas = () =>
  banco.filter((c) => c.url.pathname === "/rest/v1/rpc/bling_claim").map((c) => (c.corpo as { p_seconds: number }).p_seconds);
const gravacoesDaConexao = () => banco.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/bling_connections");

// --- Casos -------------------------------------------------------------------------------

test("assinatura errada, malformada ou ausente: 401 e o banco não é tocado", async (t) => {
  t.mock.method(console, "warn", () => {});
  const corpo = aviso();
  for (const cabecalho of [assinatura(corpo, "outro-segredo"), "sha256=abc", "", null]) {
    const resposta = await POST(pedido(corpo, cabecalho === null ? {} : { "x-bling-signature-256": cabecalho }));
    assert.equal(resposta.status, 401, `cabeçalho ${String(cabecalho)}`);
  }
  assert.equal(banco.length, 0);
  assert.equal(tarefasDepois.length, 0);
});

test("corpo acima de 64 KB: 413 pelo content-length (sem ler) e pelo tamanho lido; no limite, entra", async () => {
  const declarado = pedido("{}", { "content-length": String(LIMITE_CORPO_AVISO + 1) });
  assert.equal((await POST(declarado)).status, 413);
  assert.equal(declarado.bodyUsed, false, "recusa antes de ler o corpo");

  // Sem content-length (chunked): o tamanho lido decide, antes mesmo da assinatura.
  const grande = "x".repeat(LIMITE_CORPO_AVISO + 1);
  assert.equal((await POST(assinado(grande))).status, 413);
  assert.equal(banco.length, 0);

  const base = aviso({ pad: "" });
  const noLimite = aviso({ pad: "x".repeat(LIMITE_CORPO_AVISO - Buffer.byteLength(base)) });
  assert.equal(Buffer.byteLength(noLimite), LIMITE_CORPO_AVISO);
  assert.equal((await POST(assinado(noLimite))).status, 200);
  assert.equal(chamadasRpc().length, 1);
});

test("sem o client secret configurado: 503 (o Bling tenta de novo) e o banco não é tocado", async (t) => {
  t.mock.method(console, "error", () => {});
  delete process.env.BLING_CLIENT_SECRET;
  const resposta = await POST(assinado(aviso()));
  assert.equal(resposta.status, 503);
  assert.deepEqual(await resposta.json(), { error: "indisponivel" });
  assert.equal(banco.length, 0);
});

test("evento que não é de pedido: 200 e nada entra na fila", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const resposta = await POST(assinado(aviso({ event: "stock.updated", data: { produto: { id: 9 }, saldo: 3 } })));
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { ok: true });
  assert.equal(banco.length, 0);
  assert.equal(tarefasDepois.length, 0);
  // O log diz o motivo, nunca o corpo.
  const logado = avisos.mock.calls.map((c) => String(c.arguments[0])).join("\n");
  assert.match(logado, /outro_evento/);
  assert.doesNotMatch(logado, /saldo|stock\.updated/);
});

test("assinado mas ilegível (JSON quebrado ou pedido sem id): 200 — 4xx faria o Bling desligar o webhook de todas as lojas", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  for (const corpo of ["{não é json", aviso({ data: { numero: 77 } })]) {
    const resposta = await POST(assinado(corpo));
    assert.equal(resposta.status, 200, corpo);
  }
  assert.equal(banco.length, 0);
  assert.equal(tarefasDepois.length, 0);
  assert.doesNotMatch(erros.mock.calls.map((c) => String(c.arguments[0])).join("\n"), /não é json/);
});

test("empresa sem loja conectada (desconhecida ou desconectada): 200 e só a consulta da empresa vai ao banco", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  for (const conhecida of [null, conexao({ status: "desconectada" })]) {
    banco.length = 0;
    conexaoDaEmpresa = conhecida;
    const resposta = await POST(assinado(aviso()));
    assert.equal(resposta.status, 200);
    assert.deepEqual(banco.map((c) => `${c.metodo} ${c.url.pathname}`), ["GET /rest/v1/bling_connections"]);
    assert.equal(banco[0].url.searchParams.get("company_id"), "eq.empresa-1");
  }
  assert.equal(tarefasDepois.length, 0);
  assert.match(String(avisos.mock.calls.at(-1)?.arguments[0]), /empresa-1/);
});

test("aviso de pedido: enfileira na loja da empresa, marca last_webhook_at, responde 200 e sincroniza depois", async () => {
  const antes = Date.now();
  const resposta = await POST(assinado(aviso({ event: "order.updated", data: { id: 123, numero: 501 } })));
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { ok: true });

  assert.deepEqual(chamadasRpc().map((c) => c.corpo), [{ p_tenant: "loja-a", p_origin: "aviso", p_items: [{ id: 123 }] }]);
  const [gravacao] = gravacoesDaConexao();
  assert.ok(gravacao, "last_webhook_at gravado");
  assert.equal(gravacao.url.searchParams.get("tenant_id"), "eq.loja-a");
  const marcado = Date.parse(String((gravacao.corpo as { last_webhook_at?: unknown }).last_webhook_at));
  assert.ok(marcado >= antes && marcado <= Date.now());

  // A drenagem fica para depois da resposta, e é da loja dona da empresa.
  assert.equal(tarefasDepois.length, 1);
  const sincronizar = tarefasDepois[0];
  assert.equal(typeof sincronizar, "function");
  const resultado = await (sincronizar as () => Promise<Resultado>)();
  assert.equal(resultado.tenantId, "loja-a");
});

test("aviso que demorou: a drenagem leva até 45 s, nunca além dos 60 s da função menos o gasto e 10 s de folga, e a trava não passa da vida da função", async (t) => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  let relogio = Date.now();
  t.mock.method(Date, "now", () => relogio);
  assert.equal((await POST(assinado(aviso()))).status, 200);
  // O after() só começa 20 s depois de o aviso chegar (resposta lenta, fila da função).
  relogio += 20_000;
  await (tarefasDepois[0] as () => Promise<Resultado>)();
  // min(45, 60 − 20 − 10) = 30 s de orçamento; a trava pediria ele mais a folga de 30 s, mas a função morre
  // em 60 − 20 = 40 s. Mutante: a vida sem o gasto, ou o orçamento no lugar dela.
  assert.deepEqual(travasPedidas(), [40]);
});

test("a assinatura vale sobre os bytes crus: corpo com BOM confere e o aviso entra", async () => {
  const comBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(aviso())]);
  const resposta = await POST(assinado(new Uint8Array(comBom)));
  assert.equal(resposta.status, 200);
  assert.equal(chamadasRpc().length, 1);
  assert.equal(tarefasDepois.length, 1);
});

test("banco fora na hora de enfileirar: 500 (o Bling repete), sem marcar o aviso nem agendar", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  filaFalha = true;
  const resposta = await POST(assinado(aviso()));
  assert.equal(resposta.status, 500);
  assert.equal(gravacoesDaConexao().length, 0);
  assert.equal(tarefasDepois.length, 0);
  const logado = String(erros.mock.calls[0]?.arguments[0]);
  assert.match(logado, /empresa-1/);
  assert.match(logado, /123/);
  assert.doesNotMatch(logado, /evt-1|2026-10-13T15/);
});
