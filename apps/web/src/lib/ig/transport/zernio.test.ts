import assert from "node:assert/strict";
import { test } from "node:test";
import { ZernioError } from "./types";
import { createZernioTransport } from "./zernio";

type Pedido = { url: URL; metodo: string; headers: Record<string, string>; corpo: unknown };

function fetchFalso(respostas: Array<{ status: number; body: unknown }>) {
  const pedidos: Pedido[] = [];
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    pedidos.push({ url: new URL(String(entrada)), metodo: init?.method ?? "GET", headers, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = respostas.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, pedidos };
}

test("todo pedido leva a chave no Authorization e o Idempotency-Key quando há", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { success: true } }]);
  const z = createZernioTransport({ apiKey: "chave-x", fetchImpl });
  await z.privateReply({ accountId: "c1", platformPostId: "p1", commentId: "k1", message: "oi", idempotencyKey: "run:no" });
  assert.equal(pedidos[0].url.toString(), "https://zernio.com/api/v1/inbox/comments/p1/k1/private-reply");
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].headers.authorization, "Bearer chave-x");
  assert.equal(pedidos[0].headers["idempotency-key"], "run:no");
  assert.deepEqual(pedidos[0].corpo, { accountId: "c1", message: "oi" });
});

test("resposta pública e direct na conversa batem no caminho certo com o corpo certo", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: {} }, { status: 200, body: {} }]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  await z.publicReply({ accountId: "c1", platformPostId: "p/1", commentId: "k1", message: "Te chamei", idempotencyKey: "a" });
  await z.sendMessage({ accountId: "c1", conversationId: "v1", message: "Link", idempotencyKey: "b" });
  assert.equal(pedidos[0].url.pathname, "/api/v1/inbox/comments/p%2F1");
  assert.deepEqual(pedidos[0].corpo, { accountId: "c1", message: "Te chamei", commentId: "k1" });
  assert.equal(pedidos[1].url.pathname, "/api/v1/inbox/conversations/v1/messages");
  assert.deepEqual(pedidos[1].corpo, { accountId: "c1", message: "Link" });
});

test("ensureProfile devolve o _id criado ou, no 409, o perfil que já existe", async () => {
  const { fetchImpl } = fetchFalso([
    { status: 201, body: { profile: { _id: "novo" } } },
    { status: 409, body: { error: "dup", type: "invalid_request_error", code: "duplicate", details: { existingProfileId: "velho" } } },
  ]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  assert.equal(await z.ensureProfile("tenant-1"), "novo");
  assert.equal(await z.ensureProfile("tenant-1"), "velho");
});

test("connectUrl pede só comentário e mensagem; listAccounts filtra o perfil e a plataforma", async () => {
  const { fetchImpl, pedidos } = fetchFalso([
    { status: 200, body: { authUrl: "https://zernio.com/x" } },
    { status: 200, body: { accounts: [{ _id: "c1", username: "loja", isActive: true, needsReconnection: false, platform: "instagram" }] } },
  ]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  assert.equal(await z.connectUrl("perfil", "https://app/x?state=s"), "https://zernio.com/x");
  assert.equal(pedidos[0].url.pathname, "/api/v1/connect/instagram");
  assert.deepEqual(Object.fromEntries(pedidos[0].url.searchParams), { profileId: "perfil", redirect_url: "https://app/x?state=s", scopes: "comments,messaging" });
  assert.deepEqual(await z.listAccounts("perfil"), [{ id: "c1", username: "loja", isActive: true, needsReconnection: false }]);
  assert.deepEqual(Object.fromEntries(pedidos[1].url.searchParams), { profileId: "perfil", platform: "instagram" });
});

test("erro vira ZernioError com o envelope, e privateReplyConsumed é lido de details", async () => {
  const { fetchImpl } = fetchFalso([{ status: 400, body: { error: "spent", type: "invalid_request_error", code: "private_reply_consumed", details: { privateReplyConsumed: true } } }]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  await assert.rejects(
    () => z.privateReply({ accountId: "c", platformPostId: "p", commentId: "k", message: "m", idempotencyKey: "i" }),
    (e: unknown) => e instanceof ZernioError && e.status === 400 && e.code === "private_reply_consumed" && e.privateReplyConsumed && !e.transient,
  );
});

test("sem chave não sai pedido nenhum; rede fora vira erro passageiro; 404 ao apagar conta é sucesso", async () => {
  const { fetchImpl, pedidos } = fetchFalso([]);
  await assert.rejects(() => createZernioTransport({ apiKey: "", fetchImpl }).listAccounts("p"), (e: unknown) => e instanceof ZernioError && e.code === "zernio_api_key_missing");
  assert.equal(pedidos.length, 0);
  const caiu = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  await assert.rejects(() => createZernioTransport({ apiKey: "k", fetchImpl: caiu }).listAccounts("p"), (e: unknown) => e instanceof ZernioError && e.status === 0 && e.transient);
  const { fetchImpl: f404 } = fetchFalso([{ status: 404, body: { error: "no", type: "not_found", code: "account_not_found" } }]);
  await createZernioTransport({ apiKey: "k", fetchImpl: f404 }).deleteAccount("sumiu");
});
