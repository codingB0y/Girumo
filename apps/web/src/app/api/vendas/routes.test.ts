import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { GET as ContactGet } from "./contato/route";

/**
 * As rotas de vendas de ponta a ponta: o handler real, o getRouteTenantContext
 * real (com o guard de módulo do PR 3) e o cliente real do Supabase, falando
 * com um GoTrue e um PostgREST de mentira no mesmo servidor — só a rede é
 * trocada (padrão de `stores/leads.test.ts`, #340). O token Bearer escolhe
 * quem chama; a membership volta com a loja e o papel dessa pessoa.
 */

const STORE = "0b7c9a52-3d1e-4f6a-9c2b-5e8d7f1a2b3c";
const OTHER_STORE = "6f5e4d3c-2b1a-4c9d-8e7f-a0b1c2d3e4f5";
const SELLER = "5a1f0c3e-8b2d-4e7f-9a6c-1d3e5f7a9b0c";
const OWNER = "7e2d4c6b-1a3f-4b5e-8c7d-9f0a1b2c3d4e";
const LEAD = "3c9e1a7b-5d2f-4a8c-b6e0-2f4a6c8e0b1d";

/** Cada token é uma pessoa. "varredura" e "outra-loja" têm balde de rate limit só deles. */
const USERS: Record<string, { id: string; tenant: string; role: string }> = {
  "token-vendedora": { id: SELLER, tenant: STORE, role: "seller" },
  "token-dono": { id: OWNER, tenant: STORE, role: "owner" },
  "token-varredura": { id: "2b4d6f8a-0c1e-4a3b-9d5f-7e9a1c3e5b7d", tenant: STORE, role: "seller" },
  "token-outra-loja": { id: "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d", tenant: OTHER_STORE, role: "owner" },
};

const FERNANDA = {
  id: LEAD, name: "Fernanda Lima", phone: "5511987654321",
  source_campaign: null, source_group_id: "vip1@g.us", source_group_name: "VIP 1",
};

type Seen = { method: string; url: URL; prefer: string; body: unknown };
type Reply = { status: number; body?: unknown; contentRange?: string };

const seen: Seen[] = [];
let database: (request: Seen) => Reply = () => ({ status: 500, body: { message: "sem resposta" } });

/** GoTrue e memberships respondem pelo token; o resto é do teste (e fica em `seen`). */
function answer(req: IncomingMessage, request: Seen): Reply {
  if (request.url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const user = USERS[token];
    return user
      ? { status: 200, body: { id: user.id, email: `${token}@loja.test`, aud: "authenticated", role: "authenticated" } }
      : { status: 401, body: { message: "invalid JWT" } };
  }
  if (request.url.pathname === "/rest/v1/memberships") {
    const userId = request.url.searchParams.get("user_id")?.replace(/^eq\./, "");
    const user = Object.values(USERS).find((candidate) => candidate.id === userId);
    return { status: 200, body: user ? [{ tenant_id: user.tenant, role: user.role, modules: [] }] : [] };
  }
  seen.push(request);
  return database(request);
}

const server = createServer((req, res) => {
  let text = "";
  req.on("data", (chunk) => (text += chunk));
  req.on("end", () => {
    const request: Seen = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      prefer: String(req.headers.prefer ?? ""),
      body: text ? JSON.parse(text) : undefined,
    };
    const { status, body, contentRange } = answer(req, request);
    // `.single()`/`.maybeSingle()` fora de GET pedem um objeto, não a lista.
    const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const payload = single && Array.isArray(body) ? body[0] : body;
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (payload !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
});

let contactGet: typeof ContactGet;

before(async () => {
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-do-gotrue-falso";
  // Rate limit em memória: sem Upstash o balde é deste processo (lido na importação).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  ({ GET: contactGet } = await import("./contato/route"));
});

after(() => {
  server.close();
});

beforeEach(() => {
  seen.length = 0;
});

function call(method: string, path: string, token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const requestsTo = (path: string) => seen.filter((request) => request.url.pathname === path);

test("sem login → 401, e nada de vendas é lido", async () => {
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", null));
  assert.equal(res.status, 401);
  assert.equal(seen.length, 0);
});

test("busca: um cliente só, achado por qualquer forma do número, sempre no tenant", async () => {
  database = ({ url }) => {
    if (url.pathname === "/rest/v1/optouts") return { status: 200, body: [] };
    if (url.pathname === "/rest/v1/leads") return { status: 200, body: [FERNANDA] };
    return { status: 500 };
  };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=(11)%2098765-4321", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: { id: LEAD, nome: "Fernanda Lima", telefone: "5511987654321" }, optout: false });
  const variants = "in.(11987654321,5511987654321,1187654321,551187654321)";
  for (const path of ["/rest/v1/optouts", "/rest/v1/leads"]) {
    const [request] = requestsTo(path);
    assert.equal(request.url.searchParams.get("tenant_id"), `eq.${STORE}`, path);
    assert.equal(request.url.searchParams.get("phone"), variants, path);
    assert.equal(request.url.searchParams.get("limit"), "1", path);
  }
});

test("número sem DDD → 400 com a frase da tela, sem ir ao banco", async () => {
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=98765-4321", "token-vendedora"));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Digite o número com DDD." });
  assert.equal(seen.length, 0);
});

test("número em opt-out: optout true e nenhum contato, sem ler o lead", async () => {
  database = ({ url }) => (url.pathname === "/rest/v1/optouts" ? { status: 200, body: [{ id: "o1" }] } : { status: 500 });

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11987654321", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: null, optout: true });
  assert.equal(requestsTo("/rest/v1/leads").length, 0);
});

test("ninguém com esse número → contato null: a tela registra como cliente novo", async () => {
  // Também é o caso dos contatos capturados em regime LID, sem telefone (spec §6, medição do §9).
  database = ({ url }) =>
    url.pathname === "/rest/v1/optouts" || url.pathname === "/rest/v1/leads" ? { status: 200, body: [] } : { status: 500 };

  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=11912345678", "token-vendedora"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contato: null, optout: false });
});

test("30 buscas por minuto por pessoa; a 31ª é 429", async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const res = await contactGet(call("GET", "/api/vendas/contato?telefone=1", "token-varredura"));
    assert.equal(res.status, 400, `busca ${attempt}`);
  }
  const res = await contactGet(call("GET", "/api/vendas/contato?telefone=1", "token-varredura"));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "Muitas buscas seguidas. Espere um minuto e tente de novo." });
});
