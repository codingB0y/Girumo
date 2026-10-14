import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { checkRateLimit } from "@/lib/security/rate-limit";
import { abrir } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";

import { POST as conectar } from "../conectar/route";
import { GET } from "./route";

/**
 * O fluxo de verdade: o conectar grava o state num PostgREST de mentira que guarda as linhas
 * (uso único e versão do token valem como no banco), e o Bling é um fetch falso. O que vai
 * para 127.0.0.1 passa pelo fetch real.
 */

type Linha = Record<string, unknown>;
type Chamada = { metodo: string; url: URL; corpo: unknown };
const banco: Chamada[] = [];
const estados = new Map<string, { tenant_id: string; user_id: string; expires_at: string }>();
const conexoes = new Map<string, Linha>();
let papel: string | null = "owner";
let gravacaoFalha = false;

function filtro(url: URL, coluna: string): string | undefined {
  return url.searchParams.get(coluna)?.replace(/^[a-z]+\./, "");
}

function estadosOAuth(metodo: string, url: URL, corpo: unknown): [number, unknown] {
  if (metodo === "POST") {
    const linha = corpo as { state_hash: string; tenant_id: string; user_id: string; expires_at: string };
    estados.set(linha.state_hash, linha);
    return [201, []];
  }
  const hash = filtro(url, "state_hash");
  const linha = hash ? estados.get(hash) : undefined;
  if (!hash || !linha || Date.parse(linha.expires_at) <= Date.parse(filtro(url, "expires_at") ?? "")) return [200, []];
  estados.delete(hash);
  return [200, [{ tenant_id: linha.tenant_id, user_id: linha.user_id }]];
}

function conexoesBling(metodo: string, url: URL, corpo: unknown): [number, unknown] {
  const loja = filtro(url, "tenant_id");
  if (metodo === "GET") {
    const empresa = filtro(url, "company_id");
    return [200, [...conexoes.values()].filter((c) => (loja ? c.tenant_id === loja : c.company_id === empresa))];
  }
  if (gravacaoFalha) return [500, { code: "XX000", message: "banco fora do ar", details: null, hint: null }];
  const linha = corpo as Linha;
  if (metodo === "POST") {
    conexoes.set(String(linha.tenant_id), linha);
    return [201, []];
  }
  const atual = loja ? conexoes.get(loja) : undefined;
  if (!loja || !atual || String(atual.token_version) !== filtro(url, "token_version")) return [200, []];
  conexoes.set(loja, { ...atual, ...linha });
  return [200, [{ tenant_id: loja }]];
}

function responder(metodo: string, url: URL, corpo: unknown): [number, unknown] {
  if (url.pathname === "/auth/v1/user") return [200, { id: "usuario-1", email: "dono@loja.test" }];
  if (url.pathname === "/rest/v1/memberships") return [200, papel ? [{ tenant_id: "loja-b", role: papel, modules: [] }] : []];
  if (url.pathname === "/rest/v1/bling_oauth_states") return estadosOAuth(metodo, url, corpo);
  if (url.pathname === "/rest/v1/bling_connections") return conexoesBling(metodo, url, corpo);
  return [500, { message: `inesperado: ${metodo} ${url.pathname}` }];
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpo: unknown = bruto ? JSON.parse(bruto) : undefined;
    banco.push({ metodo: req.method ?? "", url, corpo });
    const [status, resposta] = responder(req.method ?? "", url, corpo);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(resposta));
  });
});

// --- Bling falso -------------------------------------------------------------------------

type ChamadaBling = { url: string; corpo: string };
const bling: ChamadaBling[] = [];
let emitidos = { access: "", refresh: "" };
let numero = 0;
let trocaRecusada = false;
let empresaRecusada = false;
const fetchOriginal = globalThis.fetch;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function responderBling(url: string): Response {
  const caminho = new URL(url).pathname.replace("/Api/v3", "");
  if (caminho === "/oauth/token") {
    if (trocaRecusada) return json(400, { error: "invalid_grant" });
    numero += 1;
    emitidos = { access: `jwt-de-acesso-${numero}`, refresh: `refresh-novo-${numero}` };
    return json(200, { access_token: emitidos.access, refresh_token: emitidos.refresh, expires_in: 21600 });
  }
  if (caminho === "/oauth/revoke") return json(200, {});
  if (caminho === "/empresas/me/dados-basicos") {
    return empresaRecusada ? json(403, { error: { type: "FORBIDDEN" } }) : json(200, { data: { id: "empresa-1", nome: "Moda da Ana" } });
  }
  if (caminho === "/situacoes/modulos") return json(200, { data: [{ id: 98310, nome: "Vendas" }] });
  if (caminho === "/situacoes/modulos/98310") {
    return json(200, { data: [{ id: 6, nome: "Em aberto", idHerdado: 0 }, { id: 9, nome: "Atendido", idHerdado: 0 }, { id: 4321, nome: "Pago no Pix", idHerdado: 9 }] });
  }
  return json(404, { error: { type: "RESOURCE_NOT_FOUND" } });
}

const ENV = {
  BLING_CLIENT_ID: "app-girumo",
  BLING_CLIENT_SECRET: "segredo-do-app",
  INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const CHAVE = Buffer.alloc(32, 7);

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!/^https:\/\/(api|www)\.bling\.com\.br\//.test(url)) return fetchOriginal(entrada, init);
    bling.push({ url, corpo: String(init?.body ?? "") });
    return responderBling(url);
  }) as typeof fetch;
});
beforeEach(() => {
  Object.assign(process.env, ENV);
  banco.length = 0;
  bling.length = 0;
  estados.clear();
  conexoes.clear();
  papel = "owner";
  gravacaoFalha = false;
  trocaRecusada = false;
  empresaRecusada = false;
});
after(() => {
  globalThis.fetch = fetchOriginal;
  supabase.close();
});

// --- Ajudantes ---------------------------------------------------------------------------

async function iniciar(): Promise<{ state: string; cookie: string }> {
  const resposta = await conectar(
    new Request("http://girumo.test/api/integracoes/bling/conectar", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
    }),
  );
  assert.equal(resposta.status, 200);
  const state = new URL(((await resposta.json()) as { url: string }).url).searchParams.get("state") ?? "";
  return { state, cookie: `bling_oauth_state=${state}` };
}

function retorno(query: string, cookie?: string): Request {
  return new Request(`http://girumo.test/api/integracoes/bling/retorno?${query}`, { headers: cookie ? { cookie } : {} });
}

/** Toda saída é 302 para o cartão, apagando o cookie no mesmo Path. Devolve o `bling=`. */
function destino(resposta: Response): string {
  assert.equal(resposta.status, 302);
  const [par, ...atributos] = (resposta.headers.get("set-cookie") ?? "").split("; ");
  assert.equal(par, "bling_oauth_state=");
  assert.ok(atributos.includes("Max-Age=0") && atributos.includes("Path=/api/integracoes/bling"));
  const url = new URL(resposta.headers.get("location") ?? "");
  assert.equal(`${url.origin}${url.pathname}`, "http://girumo.test/painel/configuracoes");
  assert.equal(url.searchParams.get("secao"), "integracoes");
  return url.searchParams.get("bling") ?? "";
}

const trocas = () => bling.filter((c) => c.url.endsWith("/oauth/token"));
const revogados = () => bling.filter((c) => c.url.endsWith("/oauth/revoke")).map((c) => new URLSearchParams(c.corpo).get("token"));
const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

function conexaoGravada(tenantId: string, extra: Linha = {}): Linha {
  return {
    tenant_id: tenantId, company_id: "empresa-1", company_name: "Moda da Ana", status: "reconectar",
    access_token_enc: "v1.velho.a.b", refresh_token_enc: "v1.velho.c.d", access_expires_at: null, token_version: 7,
    situations: [], situations_at: null, sale_situation_ids: [9], high_value: 500, meta_enabled: false,
    meta_campaign_id: null, backfill_from: "2026-07-01", backfill_until: "2026-09-29", backfill_page: 9,
    backfill_done_at: "2026-09-30T00:00:00+00:00", scan_cursor: null, paused_until: null, consecutive_failures: 4,
    last_webhook_at: null, last_scan_at: null, last_scan_change_at: null, last_sale_at: null, last_error: "recusou",
    last_error_at: null, reconnect_alerted_at: "2026-10-01T00:00:00+00:00", connected_at: "2026-09-29T12:00:00+00:00",
    ...extra,
  };
}

// --- Casos -------------------------------------------------------------------------------

test("retorno feliz: troca o code uma vez, grava os tokens só cifrados e volta conectado", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=codigo-1&state=${state}`, cookie))), "conectado");

  assert.equal(trocas().length, 1);
  const troca = new URLSearchParams(trocas()[0].corpo);
  assert.deepEqual([troca.get("grant_type"), troca.get("code")], ["authorization_code", "codigo-1"]);
  const gravada = conexoes.get("loja-b");
  assert.ok(gravada);
  assert.deepEqual(
    [gravada.company_id, gravada.company_name, gravada.status, gravada.token_version, gravada.connected_by],
    ["empresa-1", "Moda da Ana", "ativa", 1, "usuario-1"],
  );
  assert.deepEqual(gravada.sale_situation_ids, [9, 4321]);
  assert.deepEqual(gravada.situations, [{ id: 6, nome: "Em aberto", base: 6 }, { id: 9, nome: "Atendido", base: 9 }, { id: 4321, nome: "Pago no Pix", base: 9 }]);
  assert.equal(abrir(String(gravada.access_token_enc), contextoDoToken("loja-b", "access"), CHAVE), emitidos.access);
  assert.equal(abrir(String(gravada.refresh_token_enc), contextoDoToken("loja-b", "refresh"), CHAVE), emitidos.refresh);
  // Nenhum corpo mandado ao banco leva token aberto.
  const corpos = JSON.stringify(banco.map((c) => c.corpo));
  assert.ok(!corpos.includes(emitidos.access) && !corpos.includes(emitidos.refresh));
  assert.deepEqual(revogados(), []);
});

test("o mesmo retorno de novo (duplo clique, F5) cai em sessao sem trocar o code outra vez", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=codigo-1&state=${state}`, cookie))), "conectado");
  assert.equal(destino(await GET(retorno(`code=codigo-1&state=${state}`, cookie))), "sessao");
  assert.equal(trocas().length, 1);
});

test("cookie ausente, diferente ou state faltando: sessao sem chamar o Bling e sem gastar o state", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`))), "sessao");
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, "bling_oauth_state=outro-state"))), "sessao");
  assert.equal(destino(await GET(retorno("code=c", cookie))), "sessao");
  assert.equal(bling.length, 0);
  assert.equal(estados.size, 1);
});

test("state vencido ou desconhecido: sessao sem trocar o code", async () => {
  const { state, cookie } = await iniciar();
  const linha = estados.get(sha256(state));
  assert.ok(linha);
  estados.set(sha256(state), { ...linha, expires_at: new Date(Date.now() - 1_000).toISOString() });
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "sessao");
  // Cookie e parâmetro iguais, mas o state nunca passou pelo conectar.
  assert.equal(destino(await GET(retorno("code=c&state=inventado", "bling_oauth_state=inventado"))), "sessao");
  assert.equal(trocas().length, 0);
});

test("a loja recusou no Bling (?error=): recusado sem chamar o Bling", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`error=access_denied&state=${state}`, cookie))), "recusado");
  assert.equal(bling.length, 0);
});

test("quem pediu deixou de ser dono/admin ou saiu da loja: sessao sem trocar o code", async () => {
  for (const depois of ["operator", null]) {
    papel = "owner";
    const { state, cookie } = await iniciar();
    papel = depois;
    assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "sessao", String(depois));
  }
  assert.equal(trocas().length, 0);
  const consulta = banco.filter((c) => c.url.pathname === "/rest/v1/memberships").at(-1);
  assert.ok(consulta);
  assert.deepEqual(
    Object.fromEntries([...consulta.url.searchParams].filter(([k]) => k !== "select")),
    { tenant_id: "eq.loja-b", user_id: "eq.usuario-1", accepted_at: "not.is.null", limit: "1" },
  );
});

test("code ausente: erro, e o state já foi gasto", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`state=${state}`, cookie))), "erro");
  assert.equal(bling.length, 0);
  assert.equal(estados.size, 0);
});

// Nenhum caminho do retorno revoga: o Bling pode tratar a autorização por empresa, e revogar
// derrubaria a de outra loja que já usa a conta. Token sem uso é só descartado.
test("conta do Bling já ligada a outra loja: outra_loja, sem revogar nada e sem gravar", async () => {
  conexoes.set("loja-a", conexaoGravada("loja-a", { status: "ativa" }));
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "outra_loja");
  assert.equal(trocas().length, 1);
  assert.deepEqual(revogados(), []);
  assert.equal(conexoes.has("loja-b"), false);
  assert.equal(conexoes.get("loja-a")?.token_version, 7);
});

test("o Bling recusa a troca do code: erro e nada gravado", async () => {
  trocaRecusada = true;
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  assert.equal(conexoes.size, 0);
  assert.deepEqual(revogados(), []);
});

test("os dados da empresa não vêm: erro, sem revogar e sem gravar", async () => {
  empresaRecusada = true;
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  assert.equal(trocas().length, 1);
  assert.deepEqual(revogados(), []);
  assert.equal(conexoes.size, 0);
});

test("o banco cai na gravação: erro, sem revogar, e o token não vai para log", async () => {
  gravacaoFalha = true;
  const erros: string[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { erros.push(args.map(String).join(" ")); };
  try {
    const { state, cookie } = await iniciar();
    assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  } finally {
    console.error = consoleError;
  }
  assert.equal(trocas().length, 1);
  assert.deepEqual(revogados(), []);
  assert.ok(erros.some((linha) => linha.includes("banco fora do ar")));
  assert.ok(!erros.some((linha) => linha.includes(emitidos.access) || linha.includes(emitidos.refresh)));
});

test("reconexão da mesma loja: tokens novos, versão + 1, falhas zeradas e ajustes mantidos", async () => {
  conexoes.set("loja-b", conexaoGravada("loja-b"));
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "conectado");
  const gravada = conexoes.get("loja-b");
  assert.ok(gravada);
  assert.deepEqual(
    [gravada.status, gravada.token_version, gravada.consecutive_failures, gravada.reconnect_alerted_at, gravada.last_error],
    ["ativa", 8, 0, null, null],
  );
  assert.deepEqual([gravada.high_value, gravada.meta_enabled, gravada.sale_situation_ids, gravada.backfill_page], [500, false, [9], 9]);
  assert.equal(abrir(String(gravada.refresh_token_enc), contextoDoToken("loja-b", "refresh"), CHAVE), emitidos.refresh);
  assert.deepEqual(revogados(), []);
});

test("sem as variáveis do Bling: indisponivel sem tocar no banco nem no Bling", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.equal(destino(await GET(retorno("code=c&state=s", "bling_oauth_state=s"))), "indisponivel");
  assert.equal(banco.length, 0);
  assert.equal(bling.length, 0);
});

// Último de propósito: o balde em memória do limite fica cheio até o fim do arquivo.
test("orçamento global de /oauth/token esgotado: erro sem chamar o Bling", async () => {
  for (let i = 0; i < 10; i += 1) await checkRateLimit("bling:oauth-token", 10, 60_000);
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  assert.equal(trocas().length, 0);
});
