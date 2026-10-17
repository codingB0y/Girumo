import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { POST as Post } from "./route";

/**
 * O worker chama esta rota a cada ciclo para toda loja com auto-grow ligado.
 * Loja que cancelou seguia ganhando job de criar grupo (C17: 2448 jobs em prod
 * depois do cancelamento). PostgREST de mentira, no desenho de
 * `api/groups/recount/route.test.ts`.
 */

const LOJA = "11111111-1111-4111-8111-111111111111";
const TOKEN = "token-da-engine-de-teste";

type Chamada = { metodo: string; tabela: string };
const chamadas: Chamada[] = [];
let assinatura: Record<string, unknown>[] = [];

const supabase = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const metodo = req.method ?? "GET";
    const tabela = new URL(req.url ?? "/", "http://falso").pathname.replace("/rest/v1/", "");
    chamadas.push({ metodo, tabela });
    const respostas: Record<string, unknown> = {
      "GET organizations": [{ id: LOJA, status: "active" }],
      "GET subscriptions": assinatura,
      "GET campaign_groups": [],
      "GET groups": [],
      "GET group_grow_jobs": [],
      "PATCH group_grow_jobs": [],
    };
    const chave = `${metodo} ${tabela}`;
    res.setHeader("Content-Type", "application/json");
    res.statusCode = chave in respostas ? 200 : 500;
    res.end(JSON.stringify(chave in respostas ? respostas[chave] : { message: `inesperado: ${chave}` }));
  });
});

let POST: typeof Post;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // `ENGINE_TOKEN` é lido na importação de `@/lib/auth`.
  process.env.ENGINE_TOKEN = TOKEN;
  ({ POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

const pedir = () =>
  POST(
    new Request("http://girumo.test/api/groups/grow/pending", {
      method: "POST",
      headers: { "x-engine-token": TOKEN, "x-tenant-id": LOJA },
    }),
  );

const tocouNoAutoGrow = () =>
  chamadas.filter((c) => c.tabela === "campaign_groups" || c.tabela === "group_grow_jobs");

test("loja que cancelou: nada a criar, sem avaliar nem reivindicar job", async () => {
  assinatura = [{ status: "canceled", metadata: {}, current_period_end: "2026-10-12T00:00:00Z" }];

  const res = await pedir();

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  assert.deepEqual(tocouNoAutoGrow(), []);
});

test("loja sem linha de assinatura: mesmo desfecho", async () => {
  assinatura = [];

  const res = await pedir();

  assert.deepEqual(await res.json(), []);
  assert.deepEqual(tocouNoAutoGrow(), []);
});

test("loja em teste grátis segue para o auto-grow e o claim", async () => {
  assinatura = [{ status: "trialing", metadata: {}, current_period_end: "2026-10-24T00:00:00Z" }];

  const res = await pedir();

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  // Mutante: barrar quem tem plano pararia o auto-grow de toda loja pagante.
  assert.ok(chamadas.some((c) => c.metodo === "GET" && c.tabela === "campaign_groups"));
  assert.ok(chamadas.some((c) => c.metodo === "PATCH" && c.tabela === "group_grow_jobs"));
});
