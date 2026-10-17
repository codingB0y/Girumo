import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import type { WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";

/**
 * POST /api/schedules contra um PostgREST de mentira, com o cookie de sessão de
 * verdade (desenho de `api/links/route.test.ts`). C17: a rota não cobrava plano,
 * mandava a data crua ao banco e aceitava disparo de outra loja.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

const LOJA = "11111111-1111-4111-8111-111111111111";
const DONO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISPARO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AMANHA = () => new Date(Date.now() + 86_400_000).toISOString();

type Chamada = { metodo: string; tabela: string; busca: URLSearchParams; corpo: unknown };
const chamadas: Chamada[] = [];
let assinatura: Record<string, unknown>[] = [];
let disparos: Record<string, unknown>[] = [];

let rota: typeof import("./route");
let comSessao: (handler: () => Promise<Response>) => Promise<Response>;

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://postgrest.falso");
    const metodo = req.method ?? "GET";
    const tabela = url.pathname.replace("/rest/v1/", "");
    const corpo: unknown = bruto ? JSON.parse(bruto) : undefined;
    chamadas.push({ metodo, tabela, busca: url.searchParams, corpo });
    const respostas: Record<string, unknown> = {
      "GET memberships": [{ tenant_id: LOJA, role: "owner", modules: [] }],
      "GET session_revocations": [],
      "GET subscriptions": assinatura,
      "GET broadcasts": disparos,
      "POST schedules": { id: "agendamento-1", status: "pending", ...(corpo as object) },
      "POST funnel_events": {},
    };
    const chave = `${metodo} ${tabela}`;
    res.setHeader("Content-Type", "application/json");
    // Loja sem plano cai em BLOCKED_LIMITS: teto 0, e `assertPlanLimit` conta campanhas (HEAD + count).
    if (chave === "HEAD campaign_groups") {
      res.setHeader("Content-Range", "*/0");
      res.end();
      return;
    }
    if (!(chave in respostas)) {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: `inesperado: ${chave}` }));
      return;
    }
    res.statusCode = metodo === "POST" ? 201 : 200;
    res.end(JSON.stringify(respostas[chave]));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.AUTH_SECRET ??= "segredo-do-teste";

  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external");
  const { RequestCookies } = await import("next/dist/server/web/spec-extension/cookies");
  const { signSession, SESSION_COOKIE } = await import("@/lib/auth");
  const cookies = new RequestCookies(new Headers({ cookie: `${SESSION_COOKIE}=${await signSession(DONO)}` }));
  const trabalho = { route: "/api/schedules" } as unknown as WorkStore;
  const requisicao = { type: "request", phase: "render", cookies } as unknown as WorkUnitStore;
  comSessao = (handler) => workAsyncStorage.run(trabalho, () => workUnitAsyncStorage.run(requisicao, handler));
  rota = await import("./route");
});

after(async () => {
  // O `first_schedule` vai em `void`: deixa ele chegar antes de fechar o servidor.
  await new Promise((pronto) => setTimeout(pronto, 50));
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
  // Plano valendo, sem teto: `assertPlanLimit` libera sem contar nada.
  assinatura = [{ status: "active", metadata: {}, current_period_end: null, plans: { limits: {} } }];
  disparos = [{ id: DISPARO, tenant_id: LOJA, status: "draft" }];
});

function agendar(corpo: Record<string, unknown>): Promise<Response> {
  const req = new Request("http://localhost/api/schedules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return comSessao(() => rota.POST(req));
}

const gravou = () => chamadas.filter((c) => c.metodo === "POST" && c.tabela === "schedules");

test("loja sem plano não agenda: 402 e nada gravado", async () => {
  assinatura = [{ status: "canceled", metadata: {}, current_period_end: "2026-10-12T00:00:00Z", plans: { limits: {} } }];

  const res = await agendar({ campaignName: "Oferta", scheduledAt: AMANHA(), recurrence: "daily", campaignId: DISPARO });

  assert.equal(res.status, 402);
  assert.deepEqual(gravou(), []);
});

test("data inválida é 400, não 500 do Postgres", async () => {
  const res = await agendar({ campaignName: "Oferta", scheduledAt: "amanhã cedo", campaignId: DISPARO });

  assert.equal(res.status, 400);
  assert.deepEqual(gravou(), []);
});

test("data no passado é recusada em vez de disparar na hora", async () => {
  const res = await agendar({
    campaignName: "Oferta",
    scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    campaignId: DISPARO,
  });

  assert.equal(res.status, 400);
  assert.deepEqual(gravou(), []);
});

test("disparo que não é desta loja: 404 e a busca filtra pela loja", async () => {
  disparos = [];

  const res = await agendar({ campaignName: "Oferta", scheduledAt: AMANHA(), campaignId: DISPARO });

  assert.equal(res.status, 404);
  const [busca] = chamadas.filter((c) => c.tabela === "broadcasts");
  assert.equal(busca.busca.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(busca.busca.get("id"), `eq.${DISPARO}`);
  assert.deepEqual(gravou(), []);
});

test("id de disparo que não é uuid é 404 sem ir ao banco", async () => {
  const res = await agendar({ campaignName: "Oferta", scheduledAt: AMANHA(), campaignId: "x' or 1=1" });

  assert.equal(res.status, 404);
  assert.deepEqual(chamadas.filter((c) => c.tabela === "broadcasts"), []);
  assert.deepEqual(gravou(), []);
});

test("caminho feliz: grava na loja da sessão com a data normalizada", async () => {
  const quando = new Date(Date.now() + 3_600_000);

  const res = await agendar({
    campaignName: "Oferta",
    scheduledAt: quando.toISOString().replace("Z", "+00:00"),
    recurrence: "weekly",
    campaignId: DISPARO,
  });

  assert.equal(res.status, 201);
  const [insert] = gravou();
  const linha = insert.corpo as Record<string, unknown>;
  assert.equal(linha.tenant_id, LOJA);
  assert.equal(linha.broadcast_id, DISPARO);
  assert.equal(linha.recurrence, "weekly");
  assert.equal(linha.scheduled_at, quando.toISOString());
});
