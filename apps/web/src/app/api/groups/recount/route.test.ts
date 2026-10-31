import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as Post } from "./route";

/**
 * A rota da recontagem contra um Supabase e uma Evolution de mentira (o desenho
 * de `api/orders/route.test.ts`). O worker depende de duas coisas daqui: só a
 * engine entra, e a resposta é `{ ok: true, atualizados }`.
 */

const LOJA = "5b7e3c1a-2d4f-4a6b-8c9d-0e1f2a3b4c5d";
const TOKEN = "token-da-engine-de-teste";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];

const RESPOSTAS: Record<string, Resposta> = {
  "GET /rest/v1/organizations": { status: 200, corpo: [{ id: LOJA, status: "active" }] },
  "GET /rest/v1/instances": {
    status: 200,
    corpo: [
      {
        id: "inst-1",
        tenant_id: LOJA,
        name: "Número 1",
        phone: "5511999990000",
        purpose: "grupos",
        status: "connected",
        qr_code: null,
        provider: "evolution",
        provider_instance_id: "gr_inst-1",
        last_seen_at: null,
        connected_at: null,
        metadata: {},
        created_at: "2026-09-01T00:00:00+00:00",
        updated_at: "2026-09-01T00:00:00+00:00",
      },
    ],
  },
  "GET /rest/v1/groups": { status: 200, corpo: [{ whatsapp_group_id: "g1@g.us", members: 900 }] },
  "POST /rest/v1/groups": { status: 201, corpo: [{ id: "row-1" }] },
  "POST /rest/v1/logs": { status: 201 },
  "GET /auth/v1/user": { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } },
  "GET /rest/v1/memberships": { status: 200, corpo: [{ tenant_id: LOJA, role: "owner" }] },
  "GET /group/fetchAllGroups/gr_inst-1": {
    status: 200,
    corpo: [
      {
        id: "g1@g.us",
        subject: "Moda Kids 1",
        size: 950,
        participants: [{ id: "5511999990000@s.whatsapp.net", phoneNumber: "5511999990000@s.whatsapp.net", admin: "superadmin" }],
      },
    ],
  },
};

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = RESPOSTAS[`${chamada.metodo} ${chamada.url.pathname}`] ?? {
      status: 500,
      corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` },
    };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let POST: typeof Post;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  // Sem Upstash a trava fica desligada (o pior caso é o de antes do #397); ela
  // tem teste próprio em sincronizar.test.ts.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  // `ENGINE_TOKEN` é lido na importação de `@/lib/auth`.
  process.env.ENGINE_TOKEN = TOKEN;
  ({ POST } = await import("./route"));
});

after(() => {
  servidor.close();
});

const pedido = (headers: Record<string, string>) =>
  new Request("http://girumo.test/api/groups/recount", { method: "POST", headers });

test("a engine reconta a loja do x-tenant-id e recebe { ok, atualizados }", async () => {
  chamadas.length = 0;

  const res = await POST(pedido({ "x-engine-token": TOKEN, "x-tenant-id": LOJA }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, atualizados: 1 });
  // O tenant vem do header validado — toda leitura de dado da loja filtra por ele.
  for (const c of chamadas.filter((c) => c.metodo === "GET" && c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/organizations")) {
    assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`, c.url.pathname);
  }
  const [upsert] = chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/groups");
  assert.equal((upsert.corpo as Array<Record<string, unknown>>)[0].tenant_id, LOJA);
});

test("usuário logado não reconta: a rota é da engine", async () => {
  chamadas.length = 0;

  const res = await POST(pedido({ authorization: "Bearer token-falso", "x-tenant-id": LOJA }));

  assert.equal(res.status, 403);
  // Mutante: aceitar o dono — vira um segundo Sincronizar, sem tela e sem trava de UI.
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/group/")).length, 0);
});

test("token da engine errado volta 401, não 500", async () => {
  const res = await POST(pedido({ "x-engine-token": "outro-token", "x-tenant-id": LOJA }));

  assert.equal(res.status, 401);
});
