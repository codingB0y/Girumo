import assert from "node:assert/strict";
import { test } from "node:test";
import { createZernioInbox, InboxError } from "./zernio-inbox";

type Pedido = { url: URL; metodo: string; headers: Record<string, string>; corpo: unknown };

function fetchFalso(respostas: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  const pedidos: Pedido[] = [];
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: new URL(String(entrada)), metodo: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = respostas.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json", ...r.headers } });
  }) as typeof fetch;
  return { fetchImpl, pedidos };
}

test("lista de conversas: URL, conta, limite 100 e cursor; item torto some", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { data: [{ id: "c1", participantId: "p1", participantName: "Ana", lastMessage: "oi", updatedTime: "2026-11-01T00:00:00Z", unreadCount: 2 }, { sem: "id" }], pagination: { hasMore: true, nextCursor: "abc" } } }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  const r = await z.listConversations({ accountId: "a1", cursor: "zz", limit: 500 });
  assert.equal(pedidos[0].url.pathname, "/api/v1/inbox/conversations");
  assert.equal(pedidos[0].url.searchParams.get("accountId"), "a1");
  assert.equal(pedidos[0].url.searchParams.get("limit"), "100");
  assert.equal(pedidos[0].url.searchParams.get("cursor"), "zz");
  assert.equal(pedidos[0].url.searchParams.has("folder"), false, "folder=requests dá 400 no Instagram");
  assert.equal(pedidos[0].headers.authorization, "Bearer k");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].participantUsername, null);
  assert.equal(r.nextCursor, "abc");
});

test("mensagens: sortOrder desc, conta e cursor; sem hasMore não há próxima página", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { messages: [{ id: "m1", message: "oi", direction: "incoming", createdAt: "2026-11-01T00:00:00Z", attachments: [{ type: "image", url: "https://x/a.jpg" }], storyReply: { storyId: "s" } }], pagination: { hasMore: false, nextCursor: "ignorada" } } }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  const r = await z.listMessages({ conversationId: "c/1", accountId: "a1", cursor: "c9", limit: 20 });
  assert.equal(pedidos[0].url.pathname, "/api/v1/inbox/conversations/c%2F1/messages");
  assert.deepEqual([pedidos[0].url.searchParams.get("sortOrder"), pedidos[0].url.searchParams.get("limit"), pedidos[0].url.searchParams.get("cursor")], ["desc", "20", "c9"]);
  assert.equal(r.nextCursor, null);
  assert.equal(r.items[0].storyReply, true);
  assert.equal(JSON.stringify(r.items[0]).includes("https://x/a.jpg"), false, "a URL da Zernio não atravessa o cliente");
});

test("envio: corpo simples sem tag; com atendimento humano leva MESSAGE_TAG + HUMAN_AGENT; Idempotency-Key vai no cabeçalho", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { success: true, data: { messageId: "mid-1" } } }, { status: 200, body: {} }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  const a = await z.sendText({ conversationId: "c1", accountId: "a1", message: "Oi", humanAgent: false, idempotencyKey: "u-1" });
  const b = await z.sendText({ conversationId: "c1", accountId: "a1", message: "Oi", humanAgent: true, idempotencyKey: "u-2" });
  assert.deepEqual(pedidos[0].corpo, { accountId: "a1", message: "Oi" });
  assert.deepEqual(pedidos[1].corpo, { accountId: "a1", message: "Oi", messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" });
  assert.equal(pedidos[0].headers["idempotency-key"], "u-1");
  assert.equal(pedidos[0].metodo, "POST");
  assert.deepEqual([a, b], [{ messageId: "mid-1" }, { messageId: null }]);
});

test("marcar lida, apagar e link novo do anexo batem no caminho certo", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { success: true } }, { status: 200, body: { success: true } }, { status: 200, body: { url: "https://cdn.exemplo.com/x" } }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  await z.markRead({ conversationId: "c1", accountId: "a1" });
  await z.deleteConversation({ conversationId: "c1", accountId: "a1" });
  const url = await z.attachmentUrl({ conversationId: "c1", messageId: "m/1", index: 2, accountId: "a1" });
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname, pedidos[0].corpo], ["POST", "/api/v1/inbox/conversations/c1/read", { accountId: "a1" }]);
  assert.deepEqual([pedidos[1].metodo, pedidos[1].url.pathname, pedidos[1].url.searchParams.get("accountId")], ["DELETE", "/api/v1/inbox/conversations/c1", "a1"]);
  assert.equal(pedidos[2].url.pathname, "/api/v1/inbox/conversations/c1/messages/m%2F1/attachments/2");
  assert.equal(pedidos[2].url.searchParams.get("format"), "json");
  assert.equal(url, "https://cdn.exemplo.com/x");
});

test("link do anexo sem url na resposta é erro 502", async () => {
  const { fetchImpl } = fetchFalso([{ status: 200, body: { ok: true } }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  await assert.rejects(z.attachmentUrl({ conversationId: "c1", messageId: "m1", index: 0, accountId: "a1" }), (e: unknown) => e instanceof InboxError && e.status === 502);
});

test("erros tipados: 401/403, 404, 409, 422, 429 com Retry-After, 5xx e rede", async () => {
  const casos: Array<[number, string]> = [[401, "auth"], [403, "auth"], [404, "not_found"], [409, "conflict"], [422, "invalid"], [429, "rate_limited"], [503, "server"]];
  for (const [status, kind] of casos) {
    const { fetchImpl } = fetchFalso([{ status, body: { error: "x", code: "c" }, headers: status === 429 ? { "Retry-After": "17" } : {} }]);
    const z = createZernioInbox({ apiKey: "k", fetchImpl });
    await assert.rejects(z.markRead({ conversationId: "c1", accountId: "a1" }), (e: unknown) => {
      assert.ok(e instanceof InboxError);
      assert.equal(e.kind, kind);
      assert.equal(e.retryAfterSeconds, status === 429 ? 17 : null);
      return true;
    });
  }
  const caiu = (async () => { throw new Error("ECONNRESET https://zernio.com/api?key=segredo"); }) as unknown as typeof fetch;
  await assert.rejects(createZernioInbox({ apiKey: "k", fetchImpl: caiu }).markRead({ conversationId: "c1", accountId: "a1" }), (e: unknown) => e instanceof InboxError && e.kind === "network" && e.status === 0);
});

test("sem chave: erro de configuração antes de qualquer pedido", async () => {
  const { fetchImpl, pedidos } = fetchFalso([]);
  await assert.rejects(createZernioInbox({ apiKey: "", fetchImpl }).markRead({ conversationId: "c1", accountId: "a1" }), (e: unknown) => e instanceof InboxError && e.kind === "config");
  assert.equal(pedidos.length, 0);
});

test("anexo: attachmentUrl + attachmentType (+ texto) e devolve os dois ids, o do anexo primeiro", async () => {
  const { fetchImpl, pedidos } = fetchFalso([
    { status: 200, body: { success: true, data: { messageId: "mid-a", messageIds: ["mid-a", "mid-t"] } } },
    { status: 200, body: { success: true, data: { messageId: "mid-s" } } },
    { status: 200, body: { success: true, data: {} } },
  ]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  const com = await z.sendMedia({ conversationId: "c1", accountId: "a1", attachmentUrl: "https://x.supabase.co/a.png", attachmentType: "image", message: "Olha", humanAgent: true, idempotencyKey: "u-1" });
  assert.deepEqual(com.messageIds, ["mid-a", "mid-t"]);
  assert.deepEqual(pedidos[0].corpo, { accountId: "a1", attachmentUrl: "https://x.supabase.co/a.png", attachmentType: "image", message: "Olha", messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" });
  assert.equal(pedidos[0].headers["idempotency-key"], "u-1");
  const sem = await z.sendMedia({ conversationId: "c1", accountId: "a1", attachmentUrl: "https://x/v.mp4", attachmentType: "video", humanAgent: false, idempotencyKey: "u-2" });
  assert.deepEqual(sem.messageIds, ["mid-s"], "sem messageIds vale o messageId");
  assert.deepEqual(pedidos[1].corpo, { accountId: "a1", attachmentUrl: "https://x/v.mp4", attachmentType: "video" });
  assert.deepEqual((await z.sendMedia({ conversationId: "c1", accountId: "a1", attachmentUrl: "https://x/v.mp4", attachmentType: "video", humanAgent: false, idempotencyKey: "u-3" })).messageIds, [], "formato inesperado = sem ids, nunca erro");
});

test("anexo que a Zernio não consegue baixar chega como invalid com o código dela", async () => {
  const { fetchImpl } = fetchFalso([{ status: 422, body: { error: "x", type: "validation_error", code: "attachment_fetch_failed" } }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  await assert.rejects(z.sendMedia({ conversationId: "c1", accountId: "a1", attachmentUrl: "https://x/a.png", attachmentType: "image", humanAgent: false, idempotencyKey: "u" }), (e: unknown) => e instanceof InboxError && e.kind === "invalid" && e.code === "attachment_fetch_failed");
});

test("botão de URL: message + buttons no corpo, com a tag de atendimento humano quando precisa", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { data: { messageId: "mid-b" } } }]);
  const z = createZernioInbox({ apiKey: "k", fetchImpl });
  const r = await z.sendButtons({ conversationId: "c1", accountId: "a1", message: "Entre", buttons: [{ type: "url", title: "Entrar no grupo VIP", url: "https://app.test/r/vip" }], humanAgent: true, idempotencyKey: "u-1" });
  assert.deepEqual(r, { messageId: "mid-b" });
  assert.deepEqual(pedidos[0].corpo, { accountId: "a1", message: "Entre", buttons: [{ type: "url", title: "Entrar no grupo VIP", url: "https://app.test/r/vip" }], messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" });
});
