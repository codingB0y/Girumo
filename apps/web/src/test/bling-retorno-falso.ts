/**
 * O mundo falso das rotas de conexão do Bling (`conectar` e `retorno`), para os testes do retorno
 * (`retorno/route.test.ts`: o caminho feliz e a sessão; `retorno/route-gravacao.test.ts`: a troca do
 * code e a gravação). O conectar grava o state num PostgREST de mentira que guarda as linhas (uso único
 * e versão do token valem como no banco), e o Bling é um fetch falso; o que vai para 127.0.0.1 passa
 * pelo fetch real. O que a rota agenda no `after()` só é entregue ao teste, nunca roda sozinho. O que os
 * testes mudam (papel, banco ou Bling recusando, relógio) fica em cada arquivo: o falso só lê.
 */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

// O `after()` da rota (a primeira sincronização) só existe no escopo de requisição do Next, que
// lê este global uma vez, quando carrega: ligado antes do import das rotas, que vem no `before`.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

type Linha = Record<string, unknown>;
export type Chamada = { metodo: string; url: URL; corpo: unknown };
type ChamadaBling = { url: string; corpo: string };

/** O que um arquivo de teste controla. O que ele não passar fica no padrão: dono, nada recusado, relógio parado. */
export type CenarioDoRetorno = {
  /** O papel de quem pediu na loja; null = saiu da loja. */
  papel: () => string | null;
  /** A gravação da conexão falha (banco fora do ar). */
  gravacaoFalha: () => boolean;
  /** O Bling recusa a troca do code. */
  trocaRecusada: () => boolean;
  /** O Bling recusa os dados da empresa. */
  empresaRecusada: () => boolean;
  /** Chamado quando o Bling responde os dados da empresa: o teste anda o relógio dele. */
  naEmpresa: () => void;
};

const PADRAO: CenarioDoRetorno = {
  papel: () => "owner",
  gravacaoFalha: () => false,
  trocaRecusada: () => false,
  empresaRecusada: () => false,
  naEmpresa: () => undefined,
};
let cenario = PADRAO;

let rotaRetorno: typeof import("@/app/api/integracoes/bling/retorno/route");
let rotaConectar: typeof import("@/app/api/integracoes/bling/conectar/route");
let noEscopo: (handler: () => Promise<Response>) => Promise<Response>;
/** O que a rota agendou para depois da resposta: só é entregue aqui, nunca roda no teste. */
export const tarefasDepois: unknown[] = [];
export const GET = (req: Request) => noEscopo(() => rotaRetorno.GET(req));
const conectar = (req: Request) => rotaConectar.POST(req);

export const banco: Chamada[] = [];
export const estados = new Map<string, { tenant_id: string; user_id: string; expires_at: string }>();
export const conexoes = new Map<string, Linha>();

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
  if (cenario.gravacaoFalha()) return [500, { code: "XX000", message: "banco fora do ar", details: null, hint: null }];
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
  const papel = cenario.papel();
  if (url.pathname === "/rest/v1/memberships") return [200, papel ? [{ tenant_id: "loja-b", role: papel, modules: [] }] : []];
  if (url.pathname === "/rest/v1/bling_oauth_states") return estadosOAuth(metodo, url, corpo);
  if (url.pathname === "/rest/v1/bling_connections") return conexoesBling(metodo, url, corpo);
  // A 1ª sincronização acha a trava ocupada: o teste só lê o orçamento pelos segundos pedidos.
  if (url.pathname === "/rest/v1/rpc/bling_claim") return [200, false];
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

export const bling: ChamadaBling[] = [];
/** Os tokens da última troca do code (o teste confere que só saem cifrados). */
export let emitidos = { access: "", refresh: "" };
let numero = 0;
const fetchOriginal = globalThis.fetch;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function responderBling(url: string): Response {
  const caminho = new URL(url).pathname.replace("/Api/v3", "");
  if (caminho === "/oauth/token") {
    if (cenario.trocaRecusada()) return json(400, { error: "invalid_grant" });
    numero += 1;
    emitidos = { access: `jwt-de-acesso-${numero}`, refresh: `refresh-novo-${numero}` };
    return json(200, { access_token: emitidos.access, refresh_token: emitidos.refresh, expires_in: 21600 });
  }
  if (caminho === "/oauth/revoke") return json(200, {});
  if (caminho === "/empresas/me/dados-basicos") {
    cenario.naEmpresa();
    return cenario.empresaRecusada() ? json(403, { error: { type: "FORBIDDEN" } }) : json(200, { data: { id: "empresa-1", nome: "Moda da Ana" } });
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
export const CHAVE = Buffer.alloc(32, 7);

/** Liga o mundo falso no arquivo de teste: o cenário dele, o PostgREST, o Bling e as rotas no escopo do Next. */
export function montarRetorno(parcial: Partial<CenarioDoRetorno> = {}): void {
  cenario = { ...PADRAO, ...parcial };
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
    const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
    const escopo = { afterContext: { after: (tarefa: unknown) => void tarefasDepois.push(tarefa) } } as unknown as WorkStore;
    noEscopo = (handler) => workAsyncStorage.run(escopo, handler);
    rotaRetorno = await import("@/app/api/integracoes/bling/retorno/route");
    rotaConectar = await import("@/app/api/integracoes/bling/conectar/route");
  });
  beforeEach(() => {
    Object.assign(process.env, ENV);
    tarefasDepois.length = 0;
    banco.length = 0;
    bling.length = 0;
    estados.clear();
    conexoes.clear();
  });
  after(() => {
    globalThis.fetch = fetchOriginal;
    supabase.close();
  });
}

// --- Ajudantes ---------------------------------------------------------------------------

export async function iniciar(): Promise<{ state: string; cookie: string }> {
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

export function retorno(query: string, cookie?: string): Request {
  return new Request(`http://girumo.test/api/integracoes/bling/retorno?${query}`, { headers: cookie ? { cookie } : {} });
}

/** Toda saída é 302 para o cartão, apagando o cookie no mesmo Path. Devolve o `bling=`. */
export function destino(resposta: Response): string {
  assert.equal(resposta.status, 302);
  const [par, ...atributos] = (resposta.headers.get("set-cookie") ?? "").split("; ");
  assert.equal(par, "bling_oauth_state=");
  assert.ok(atributos.includes("Max-Age=0") && atributos.includes("Path=/api/integracoes/bling"));
  const url = new URL(resposta.headers.get("location") ?? "");
  assert.equal(`${url.origin}${url.pathname}`, "http://girumo.test/painel/configuracoes");
  assert.equal(url.searchParams.get("secao"), "integracoes");
  return url.searchParams.get("bling") ?? "";
}

export const trocas = () => bling.filter((c) => c.url.endsWith("/oauth/token"));
export const travasPedidas = () =>
  banco.filter((c) => c.url.pathname === "/rest/v1/rpc/bling_claim").map((c) => (c.corpo as { p_seconds: number }).p_seconds);
export const revogados = () => bling.filter((c) => c.url.endsWith("/oauth/revoke")).map((c) => new URLSearchParams(c.corpo).get("token"));
export const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

export function conexaoGravada(tenantId: string, extra: Linha = {}): Linha {
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
