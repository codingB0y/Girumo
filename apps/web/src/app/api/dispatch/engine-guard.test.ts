import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

/**
 * `/api/dispatch/pending` e `/api/dispatch/ack` são da ENGINE. Até 10/10/2026 a
 * única barreira era a chave exata no `ENGINE_ONLY` do middleware: o handler
 * aceitava qualquer chamada e tirava o tenant de `x-tenant-id` ou do corpo.
 * Aqui o handler confere sozinho — token da engine, tenant do header — e quem
 * não for a engine leva 403 mesmo que algum dia o middleware deixe passar.
 */

const ENGINE = "token-da-engine-de-teste";
const LOJA = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
const OUTRA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];

const supabase = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const metodo = req.method ?? "";
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo, url });
    const json = (status: number, corpo: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(corpo));
    };
    if (url.pathname === "/auth/v1/user") return json(200, { id: "usuario-1", email: "dono@loja.test" });
    if (url.pathname === "/rest/v1/memberships") return json(200, [{ tenant_id: LOJA, role: "owner" }]);
    if (url.pathname === "/rest/v1/organizations") return json(200, { id: LOJA, status: "active" });
    if (url.pathname === "/rest/v1/schedules") return json(200, []);
    if (metodo === "PATCH" && url.pathname === "/rest/v1/broadcasts") {
      const ack = url.searchParams.has("id");
      return json(200, ack ? { id: "oferta-1", status: "sent", sent: 3, total: 3, error: null } : []);
    }
    json(500, { message: `inesperado: ${metodo} ${url.pathname}` });
  });
});

let ack: (req: Request) => Promise<Response>;
let pending: (req: Request) => Promise<Response>;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  // `ENGINE_TOKEN` é lido no import de `lib/auth`: a env tem que existir antes.
  process.env.ENGINE_TOKEN = ENGINE;
  ack = (await import("./ack/route")).POST;
  pending = (await import("./pending/route")).POST;
});

after(() => {
  supabase.close();
});

function req(caminho: string, headers: Record<string, string>, corpo?: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

const doDono = { authorization: "Bearer token-falso", "x-tenant-id": LOJA };
const daEngine = { "x-engine-token": ENGINE, "x-tenant-id": LOJA };
const corpoAck = { id: "oferta-1", status: "sent", sent: 3, total: 3 };

function patches(): Chamada[] {
  return chamadas.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/broadcasts");
}

test("ack recusa usuário logado com 403 e não toca na oferta", async () => {
  chamadas.length = 0;
  const res = await ack(req("/api/dispatch/ack", doDono, { ...corpoAck, tenantId: LOJA }));
  assert.equal(res.status, 403);
  assert.equal(patches().length, 0);
});

test("ack recusa token de engine errado com 401", async () => {
  chamadas.length = 0;
  const res = await ack(req("/api/dispatch/ack", { ...daEngine, "x-engine-token": "chute" }, corpoAck));
  assert.equal(res.status, 401);
  assert.equal(patches().length, 0);
});

test("ack da engine grava no tenant do header, nunca no do corpo", async () => {
  chamadas.length = 0;
  const res = await ack(req("/api/dispatch/ack", daEngine, { ...corpoAck, tenantId: OUTRA }));
  assert.equal(res.status, 200);
  const [patch] = patches();
  assert.equal(patch?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});

test("pending recusa usuário logado com 403 e não reivindica nada", async () => {
  chamadas.length = 0;
  const res = await pending(req("/api/dispatch/pending", doDono));
  assert.equal(res.status, 403);
  assert.equal(patches().length, 0);
});

test("pending da engine reivindica só no tenant do header", async () => {
  chamadas.length = 0;
  const res = await pending(req("/api/dispatch/pending", daEngine));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  const [patch] = patches();
  assert.equal(patch?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});
