import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { POST } from "./route";

/** Dono logado por Bearer contra um PostgREST de mentira (molde de integracoes/site/chave). */

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";

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
    else if (url.pathname === "/rest/v1/bling_oauth_states") [status, corpo] = [req.method === "POST" ? 201 : 200, []];
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

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});
beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  Object.assign(process.env, ENV);
});
after(() => { supabase.close(); });

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/bling/conectar", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

const estados = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/bling_oauth_states");

async function stateDaUrl(resposta: Response): Promise<string> {
  const { url } = (await resposta.json()) as { url: string };
  return new URL(url).searchParams.get("state") ?? "";
}

test("dono recebe a URL do Bling com o state, e o mesmo state vai num cookie protegido", async () => {
  const antes = Date.now();
  const resposta = await POST(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const { url } = (await resposta.clone().json()) as { url: string };
  const autorizacao = new URL(url);
  assert.equal(`${autorizacao.origin}${autorizacao.pathname}`, "https://www.bling.com.br/Api/v3/oauth/authorize");
  assert.equal(autorizacao.searchParams.get("response_type"), "code");
  assert.equal(autorizacao.searchParams.get("client_id"), "app-girumo");
  const state = await stateDaUrl(resposta);
  assert.match(state, /^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url

  const [par, ...atributos] = (resposta.headers.get("set-cookie") ?? "").split("; ");
  assert.equal(par, `bling_oauth_state=${state}`);
  assert.deepEqual(atributos.sort(), ["HttpOnly", "Max-Age=600", "Path=/api/integracoes/bling", "SameSite=Lax", "Secure"]);

  const [faxina, insercao] = estados();
  assert.equal(faxina.metodo, "DELETE");
  assert.equal(faxina.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.match(faxina.url.searchParams.get("expires_at") ?? "", /^lte\./);
  assert.equal(insercao.metodo, "POST");
  const gravado = insercao.corpo as Record<string, string>;
  assert.equal(gravado.state_hash, createHash("sha256").update(state).digest("hex"));
  assert.equal(gravado.tenant_id, "loja-b");
  assert.equal(gravado.user_id, "usuario-1");
  const expira = Date.parse(gravado.expires_at);
  assert.ok(expira >= antes + 600_000 && expira <= Date.now() + 600_000);
  // O state inteiro só existe no cookie e na URL; o banco guarda o hash.
  assert.ok(!JSON.stringify(chamadas.map((c) => c.corpo)).includes(state));
});

test("admin também conecta, e cada clique gera um state novo", async () => {
  papel = "admin";
  const primeiro = await stateDaUrl(await POST(pedir()));
  const segundo = await stateDaUrl(await POST(pedir()));
  assert.ok(primeiro && segundo);
  assert.notEqual(primeiro, segundo);
});

test("operador e vendedora: 403 e nenhum state é gravado", async () => {
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    const resposta = await POST(pedir());
    assert.equal(resposta.status, 403, p);
    assert.equal(resposta.headers.get("set-cookie"), null);
    assert.equal(estados().length, 0);
  }
});

test("sem as credenciais do app ou sem a chave de cifra: 503 indisponivel, sem gravar", async () => {
  const faltas: Array<[string, string | undefined]> = [
    ["BLING_CLIENT_ID", undefined],
    ["BLING_CLIENT_SECRET", undefined],
    ["INTEGRATIONS_ENCRYPTION_KEY", undefined],
    // 31 bytes: chave inválida conta como ausente.
    ["INTEGRATIONS_ENCRYPTION_KEY", Buffer.alloc(31, 7).toString("base64")],
  ];
  for (const [nome, valor] of faltas) {
    Object.assign(process.env, ENV);
    chamadas.length = 0;
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
    const resposta = await POST(pedir());
    assert.equal(resposta.status, 503, nome);
    assert.deepEqual(await resposta.json(), { error: "indisponivel" });
    assert.equal(estados().length, 0);
  }
});

test("operador sem as variáveis continua recebendo 403, não 503", async () => {
  delete process.env.BLING_CLIENT_ID;
  papel = "operator";
  assert.equal((await POST(pedir())).status, 403);
});
