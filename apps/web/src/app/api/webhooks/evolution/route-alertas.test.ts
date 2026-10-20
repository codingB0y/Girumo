import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import type { POST as Post } from "./route";

/**
 * O webhook da Evolution contra um Supabase de mentira (o PostgREST falso de
 * `api/orders/route.test.ts`). Cobre só o marco de funil da primeira conexão:
 * sem ele, o cron mandava "conecte seu WhatsApp" para quem já tinha conectado.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
// Sem ele o `revalidateTag` do link da bio (número novo conectado) não tem escopo de requisição.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

const SEGREDO = "dev-evolution-webhook-secret";
const LOJA = "loja-a";

type Chamada = { metodo: string; url: URL; corpo: unknown; prefer: string };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      prefer: String(req.headers.prefer ?? ""),
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

function responder({ metodo, url }: Chamada): Resposta {
  const rota = `${metodo} ${url.pathname}`;
  if (rota === "GET /rest/v1/instances") {
    return { status: 200, corpo: [{ id: "inst-1", tenant_id: LOJA, status: "qr", phone: null }] };
  }
  if (rota === "POST /rest/v1/rpc/update_instance_status") return { status: 200, corpo: {} };
  if (rota === "POST /rest/v1/funnel_events") return { status: 201 };
  if (rota === "POST /rest/v1/rpc/record_engine_event") {
    return { status: 200, corpo: { created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z" } };
  }
  return { status: 500, corpo: { message: `inesperado: ${rota}` } };
}

let POST: typeof Post;
let naRequisicao: (escopo: WorkStore, fn: () => Promise<Response>) => Promise<Response>;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  delete process.env.EVOLUTION_WEBHOOK_SECRET;
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  naRequisicao = (escopo, fn) => workAsyncStorage.run(escopo, fn);
  ({ POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

function conexao(state: string): Request {
  return new Request("http://girumo.test/api/webhooks/evolution", {
    method: "POST",
    headers: { "content-type": "application/json", "x-evolution-webhook-secret": SEGREDO },
    body: JSON.stringify({
      event: "connection.update",
      instance: "girumo-loja-a",
      date_time: "2026-10-16T09:00:00.000Z",
      data: { instance: "girumo-loja-a", state, wuid: "5511999990000@s.whatsapp.net", statusReason: 200 },
    }),
  });
}

/** Escopo de requisição falso: o `revalidateTag` do Next só pede `incrementalCache` e registra a tag nele. */
const novoEscopo = () => ({ incrementalCache: {} }) as unknown as WorkStore;

function marcosGravados(): Chamada[] {
  return chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/funnel_events");
}

test("conexão aberta grava o marco qr_connected da loja", async () => {
  const escopo = novoEscopo();
  const resposta = await naRequisicao(escopo, () => POST(conexao("open")));
  assert.equal(resposta.status, 200);
  // Primeira conexão (instância sem telefone): o número novo refaz o link da bio da loja.
  assert.ok(escopo.pendingRevalidatedTags?.includes(`bio-loja:${LOJA}`), `tags: ${escopo.pendingRevalidatedTags}`);
  const marcos = marcosGravados();
  assert.equal(marcos.length, 1);
  const marco = marcos[0].corpo as { tenant_id: string; event_name: string; user_id: string | null };
  assert.equal(marco.tenant_id, LOJA);
  assert.equal(marco.event_name, "qr_connected");
  assert.equal(marco.user_id, null);
  // Só a primeira vez conta: reconectar não pode mover a data do marco.
  assert.match(marcos[0].prefer, /resolution=ignore-duplicates/);
});

test("queda da conexão não grava marco", async () => {
  const resposta = await naRequisicao(novoEscopo(), () => POST(conexao("close")));
  assert.equal(resposta.status, 200);
  assert.deepEqual(marcosGravados(), []);
});
