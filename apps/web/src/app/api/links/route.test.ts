import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import type { WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";

/**
 * POST /api/links de ponta a ponta contra um PostgREST de mentira (padrão de
 * `api/members/members.test.ts`). A sessão é o cookie de verdade, assinado, lido
 * pelo `cookies()` do Next dentro de um escopo de requisição falso.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

const LOJA = "11111111-1111-4111-8111-111111111111";
const DONO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Chamada = { metodo: string; tabela: string; corpo: unknown };
const chamadas: Chamada[] = [];
let campanhasForaDoAr = false;

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
    chamadas.push({ metodo, tabela, corpo });
    res.setHeader("Content-Type", "application/json");

    const rotaDoBanco = `${metodo} ${tabela}`;
    if (rotaDoBanco === "GET campaign_groups" && campanhasForaDoAr) {
      res.statusCode = 500;
      res.end(JSON.stringify({ code: "XX000", message: "banco fora do ar", details: null, hint: null }));
      return;
    }
    const respostas: Record<string, unknown> = {
      "GET memberships": [{ tenant_id: LOJA, role: "owner", modules: [] }],
      "GET session_revocations": [],
      "GET tracked_links": [],
      "GET campaign_groups": [{ id: "camp-1" }],
      "POST tracked_links": { id: "link-novo", created_at: "2026-10-16T12:00:00+00:00", ...(corpo as object) },
      "PATCH tracked_links": [],
    };
    if (!(rotaDoBanco in respostas)) {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: `inesperado: ${rotaDoBanco}` }));
      return;
    }
    res.statusCode = metodo === "POST" ? 201 : 200;
    res.end(JSON.stringify(respostas[rotaDoBanco]));
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
  const trabalho = { route: "/api/links" } as unknown as WorkStore;
  const requisicao = { type: "request", phase: "render", cookies } as unknown as WorkUnitStore;
  comSessao = (handler) => workAsyncStorage.run(trabalho, () => workUnitAsyncStorage.run(requisicao, handler));
  rota = await import("./route");
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
  campanhasForaDoAr = false;
});

function criar(corpo: Record<string, unknown>): Promise<Response> {
  const req = new Request("http://localhost/api/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return comSessao(() => rota.POST(req));
}

const escritas = (metodo: string) => chamadas.filter((c) => c.metodo === metodo && c.tabela === "tracked_links");

test("Pixel e teto vão no próprio insert do link, sem update solto depois", async () => {
  const res = await criar({
    destinationUrl: "https://chat.whatsapp.com/CONVITE1",
    slug: "moda-kids",
    campaignGroupId: "camp-1",
    pixelId: "123456",
    clickCap: 50,
  });

  assert.equal(res.status, 201);
  const [insert] = escritas("POST");
  const linha = insert.corpo as { tenant_id: string; campaign_group_id: string; metadata: Record<string, unknown> };
  assert.equal(linha.tenant_id, LOJA);
  assert.equal(linha.campaign_group_id, "camp-1");
  assert.deepEqual(linha.metadata, { campaignName: "", targetGroupName: "", pixelId: "123456", clickCap: 50 });
  // Mutante: o update separado, sem conferir o erro, respondia 201 mesmo sem gravar Pixel e teto.
  assert.equal(escritas("PATCH").length, 0);
});

test("falha ao conferir a campanha: não cria link sem vínculo", async () => {
  campanhasForaDoAr = true;

  await assert.rejects(criar({ destinationUrl: "https://chat.whatsapp.com/CONVITE1", slug: "moda-kids", campaignGroupId: "camp-1" }));

  // Antes, o erro virava "sem campanha" e o link nascia solto, com 201.
  assert.equal(escritas("POST").length, 0);
});
