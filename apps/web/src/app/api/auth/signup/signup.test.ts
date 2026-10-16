import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { LEGAL_VERSION } from "@/lib/legal";

/**
 * O cadastro por senha de verdade contra um Supabase falso em 127.0.0.1 (padrão
 * de `api/members/members.test.ts`): só a rede é trocada.
 *
 * O que prova: a conta nasce com `email_confirm: true`, então digitar o e-mail
 * de um convite não prova posse dele. Sem o id do convite (que só o link do
 * e-mail traz), o cadastro segue como conta nova — com loja própria — e o
 * convite fica intacto para a dona do e-mail.
 */

(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

type Linha = Record<string, unknown>;
type Pedido = { metodo: string; caminho: string; url: URL; corpo: unknown };
type Rota = typeof import("./route");

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA_LOJA = "22222222-2222-4222-8222-222222222222";
const CONVITE = "33333333-3333-4333-8333-333333333333";
const CONVITE_DE_OUTRO = "44444444-4444-4444-8444-444444444444";
const NOVO_USUARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVIDADA = "convidada@loja.test";

let banco: Record<string, Linha[]> = {};
const pedidos: Pedido[] = [];
let rota: Rota;
let chamar: (handler: () => Promise<Response>) => Promise<Response>;

/** Filtros que a rota usa: `eq.`, `is.null` e `ilike.` (sem curinga, como o e-mail chega). */
function casa(linha: Linha, url: URL): boolean {
  for (const [coluna, valor] of url.searchParams) {
    if (valor.startsWith("eq.") && String(linha[coluna]) !== valor.slice(3)) return false;
    if (valor === "is.null" && linha[coluna] != null) return false;
    if (valor.startsWith("ilike.") && String(linha[coluna] ?? "").toLowerCase() !== valor.slice(6).toLowerCase()) {
      return false;
    }
  }
  return true;
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((pronto) => {
    let bruto = "";
    req.on("data", (pedaco) => {
      bruto += pedaco;
    });
    req.on("end", () => pronto(bruto ? JSON.parse(bruto) : undefined));
  });
}

const supabase = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  const metodo = req.method ?? "GET";
  const corpo = await lerCorpo(req);
  pedidos.push({ metodo, caminho: url.pathname, url, corpo });
  res.setHeader("Content-Type", "application/json");

  if (url.pathname === "/auth/v1/admin/users" && metodo === "POST") {
    const { email } = corpo as { email: string };
    res.end(JSON.stringify({ id: NOVO_USUARIO, email, aud: "authenticated", app_metadata: {}, user_metadata: {} }));
    return;
  }
  // Sem sessão de volta: o client admin é compartilhado e não deve guardar a do usuário.
  if (url.pathname === "/auth/v1/token") {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "invalid_grant", error_description: "falso" }));
    return;
  }

  const tabela = url.pathname.replace("/rest/v1/", "");
  const linhas = banco[tabela] ?? [];

  if (metodo === "GET") {
    res.end(JSON.stringify(linhas.filter((l) => casa(l, url))));
    return;
  }
  if (metodo === "PATCH") {
    const mudadas = linhas.filter((l) => casa(l, url)).map((l) => ({ ...l, ...(corpo as Linha) }));
    banco = { ...banco, [tabela]: linhas.map((l) => mudadas.find((m) => m.id === l.id) ?? l) };
    res.end(JSON.stringify(mudadas));
    return;
  }
  if (metodo === "POST") {
    const novas = (Array.isArray(corpo) ? corpo : [corpo]).map((c) => ({ id: randomUUID(), ...(c as Linha) }));
    banco = { ...banco, [tabela]: [...linhas, ...novas] };
    res.statusCode = 201;
    const devolve = String(req.headers.prefer ?? "").includes("return=representation");
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    res.end(devolve ? JSON.stringify(objeto ? novas[0] : novas) : "");
    return;
  }
  res.statusCode = 405;
  res.end("{}");
});

function convite(id: string, tenantId: string, email: string, role: string): Linha {
  return {
    id,
    tenant_id: tenantId,
    user_id: null,
    role,
    invited_email: email,
    accepted_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
  };
}

function cadastro(extra: Linha = {}): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Quem Digitou", email: CONVIDADA, password: "123456", legalVersion: LEGAL_VERSION, ...extra }),
  });
}

function escritas(metodo: string, tabela: string): Linha[] {
  return pedidos.filter((p) => p.metodo === metodo && p.caminho === `/rest/v1/${tabela}`).map((p) => p.corpo as Linha);
}

function linhaDe(id: string): Linha | undefined {
  return banco.memberships.find((m) => m.id === id);
}

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-do-falso";
  process.env.SUPABASE_ANON_KEY = "anon-do-falso";
  process.env.AUTH_SECRET ??= "segredo-do-teste";

  // `cookies()` do Next só existe dentro de um request do Next; a rota grava o
  // `dz_session` nele. Trocado ANTES de a rota carregar (import dinâmico).
  const headersDoNext = createRequire(import.meta.url)("next/headers") as { cookies: () => Promise<unknown> };
  headersDoNext.cookies = async () => ({ get: () => undefined, set: () => undefined });

  // Escopo falso de requisição: o `after()` (funil e boas-vindas) não roda em teste.
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const escopo = { afterContext: { after: () => undefined } } as unknown as WorkStore;
  chamar = (handler) => workAsyncStorage.run(escopo, handler);
  rota = await import("./route");
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  banco = {
    memberships: [
      convite(CONVITE, LOJA, CONVIDADA, "admin"),
      convite(CONVITE_DE_OUTRO, OUTRA_LOJA, "outra@loja.test", "admin"),
    ],
  };
  pedidos.length = 0;
});

test("signup with an invited email but no invite link creates its own store and leaves the invite alone", async () => {
  const res = await chamar(() => rota.POST(cadastro()));
  assert.equal(res.status, 201);
  const corpo = (await res.json()) as Linha;

  assert.equal(corpo.joinedViaInvite, undefined);
  assert.notEqual(corpo.tenantId, LOJA);
  assert.equal(escritas("PATCH", "memberships").length, 0, "nenhuma escrita na linha do convite");
  assert.equal(linhaDe(CONVITE)?.user_id, null);
  assert.equal(escritas("POST", "organizations").length, 1, "a conta nasce com loja própria");
});

test("signup through the invite link joins the inviting store with the invite role", async () => {
  const res = await chamar(() => rota.POST(cadastro({ inviteId: CONVITE })));
  assert.equal(res.status, 201);
  const corpo = (await res.json()) as Linha;

  assert.equal(corpo.joinedViaInvite, true);
  assert.equal(corpo.tenantId, LOJA);
  assert.equal(corpo.role, "admin");
  assert.equal(linhaDe(CONVITE)?.user_id, NOVO_USUARIO);
  assert.equal(escritas("POST", "organizations").length, 0, "sem loja fantasma");
});

test("signup with another invite's id does not join any store", async () => {
  const res = await chamar(() => rota.POST(cadastro({ inviteId: CONVITE_DE_OUTRO })));
  assert.equal(res.status, 201);
  const corpo = (await res.json()) as Linha;

  assert.equal(corpo.joinedViaInvite, undefined);
  assert.equal(escritas("PATCH", "memberships").length, 0);
  assert.equal(linhaDe(CONVITE)?.user_id, null);
  assert.equal(linhaDe(CONVITE_DE_OUTRO)?.user_id, null);
});
