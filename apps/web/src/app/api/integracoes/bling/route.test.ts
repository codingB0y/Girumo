import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { selar } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";

import { DELETE } from "./route";

/** Dono logado por Bearer contra um PostgREST de mentira; o Bling é um fetch falso. */

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let conexao: Record<string, unknown> | null = null;

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${req.method} ${url.pathname}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel, modules: [] }]];
    else if (url.pathname === "/rest/v1/bling_connections") [status, corpo] = [200, req.method === "GET" && conexao ? [conexao] : []];
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(corpo));
  });
});

const ENV = {
  BLING_CLIENT_ID: "app-girumo",
  BLING_CLIENT_SECRET: "segredo-do-app",
  INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const CHAVE = Buffer.alloc(32, 7);
const REFRESH = "refresh-da-loja-b";

const revogacoes: string[] = [];
let blingFora = false;
const fetchOriginal = globalThis.fetch;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!url.startsWith("https://api.bling.com.br/")) return fetchOriginal(entrada, init);
    revogacoes.push(new URLSearchParams(String(init?.body ?? "")).get("token") ?? "");
    return new Response(blingFora ? "{}" : "", { status: blingFora ? 503 : 200 });
  }) as typeof fetch;
});
beforeEach(() => {
  Object.assign(process.env, ENV);
  chamadas.length = 0;
  revogacoes.length = 0;
  papel = "owner";
  blingFora = false;
  conexao = linha(selar(REFRESH, contextoDoToken("loja-b", "refresh"), CHAVE));
});
after(() => {
  globalThis.fetch = fetchOriginal;
  supabase.close();
});

function linha(refreshTokenEnc: string): Record<string, unknown> {
  return {
    tenant_id: "loja-b", company_id: "empresa-1", company_name: "Moda da Ana", status: "ativa",
    access_token_enc: selar("acesso-da-loja-b", contextoDoToken("loja-b", "access"), CHAVE), refresh_token_enc: refreshTokenEnc,
    access_expires_at: "2026-10-13T18:00:00+00:00", token_version: 2, situations: [], situations_at: null,
    sale_situation_ids: [9], high_value: null, meta_enabled: true, meta_campaign_id: null, backfill_from: null,
    backfill_until: null, backfill_page: 1, backfill_done_at: null, scan_cursor: null, paused_until: null,
    consecutive_failures: 0, last_webhook_at: null, last_scan_at: null, last_scan_change_at: null, last_sale_at: null,
    last_error: null, last_error_at: null, reconnect_alerted_at: null, connected_at: "2026-10-13T12:00:00+00:00",
  };
}

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/bling", {
    method: "DELETE",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

const gravacoes = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/bling_connections" && c.metodo === "PATCH");

test("dono desconecta: apaga os tokens, solta a trava, revoga o refresh no Bling e responde ok", async () => {
  const resposta = await DELETE(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  assert.deepEqual(await resposta.json(), { ok: true });

  const [gravacao] = gravacoes();
  assert.equal(gravacao.url.searchParams.get("tenant_id"), "eq.loja-b");
  const b = gravacao.corpo as Record<string, unknown>;
  assert.deepEqual(
    [b.status, b.access_token_enc, b.refresh_token_enc, b.company_id, b.lease_holder, b.token_version],
    ["desconectada", null, null, null, null, 3],
  );
  assert.deepEqual(revogacoes, [REFRESH]);
});

test("sem conexão: 404 e nada é gravado nem revogado", async () => {
  conexao = null;
  const resposta = await DELETE(pedir());
  assert.equal(resposta.status, 404);
  assert.deepEqual(await resposta.json(), { error: "Sem conexão com o Bling." });
  assert.equal(gravacoes().length, 0);
  assert.deepEqual(revogacoes, []);
});

test("operador e vendedora: 403 sem tocar na conexão", async () => {
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await DELETE(pedir())).status, 403, p);
    assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/bling_connections").length, 0);
  }
});

test("revogação que não dá certo não impede a desconexão", async () => {
  // Bling fora do ar.
  blingFora = true;
  assert.equal((await DELETE(pedir())).status, 200);
  assert.deepEqual(revogacoes, [REFRESH]);

  // Cifra de outra loja não abre aqui: nada vai ao Bling.
  revogacoes.length = 0;
  conexao = linha(selar(REFRESH, contextoDoToken("loja-a", "refresh"), CHAVE));
  assert.equal((await DELETE(pedir())).status, 200);
  assert.deepEqual(revogacoes, []);

  // Sem as variáveis do Bling ainda desconecta; só não revoga.
  delete process.env.BLING_CLIENT_SECRET;
  assert.equal((await DELETE(pedir())).status, 200);
  assert.deepEqual(revogacoes, []);
  assert.equal(gravacoes().length, 3);
});
