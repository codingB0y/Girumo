import assert from "node:assert/strict";
import { test } from "node:test";

import { criarClienteYampi, YampiErro, type OpcoesClienteYampi } from "./cliente";

const TOKEN = ["Zk3pQ9vL2x", "W8cR5tN7mB4y"].join(""); // em pedaços: o scan de secrets
const CHAVE_SECRETA = ["h6jD1fG0aS", "e2uV7oK9nT3q"].join("");

type Pedido = { url: string; init: RequestInit & { headers: Record<string, string> } };

const json = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...cabecalhos } });

/** Relógio falso: `esperar` registra e adianta o relógio; cada teste ganha um mapa de bloqueios novo. */
function cliente(respostas: Array<Response | Error>, over: Partial<OpcoesClienteYampi> = {}) {
  const pedidos: Pedido[] = [];
  const esperas: number[] = [];
  let relogio = 1_000_000;
  const fila = [...respostas];
  const fetchImpl = (async (url: string, init: Pedido["init"]) => {
    pedidos.push({ url, init });
    const proxima = fila.shift();
    if (!proxima) throw new Error("sem resposta combinada");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  }) as unknown as typeof fetch;
  const c = criarClienteYampi({
    alias: "loja-exemplo", token: TOKEN, secretKey: CHAVE_SECRETA, fetchImpl, bloqueios: new Map(),
    agora: () => relogio,
    esperar: async (ms) => { esperas.push(ms); relogio += ms; },
    ...over,
  });
  return { c, pedidos, esperas };
}

const erroCom = (status: number, retryAfterMs?: number) => (e: unknown) =>
  e instanceof YampiErro && e.status === status && (retryAfterMs === undefined || e.retryAfterMs === retryAfterMs);

test("get monta a URL com o alias e a consulta, manda User-Token e User-Secret-Key e não segue redirecionamento", async () => {
  const { c, pedidos } = cliente([json({ data: [] })]);
  assert.deepEqual(await c.get("/orders", { limit: 1 }), { data: [] });
  assert.equal(pedidos[0].url, "https://api.dooki.com.br/v2/loja-exemplo/orders?limit=1");
  const { headers, redirect, method } = pedidos[0].init;
  assert.deepEqual([headers["User-Token"], headers["User-Secret-Key"], headers.Accept, redirect, method], [TOKEN, CHAVE_SECRETA, "application/json", "error", "GET"]);
  assert.ok(pedidos[0].init.signal, "a chamada tem timeout");
});

test("alias fora da regra nunca chega ao fetch", () => {
  let chamadas = 0;
  const fetchImpl = (async () => { chamadas += 1; return new Response("{}"); }) as typeof fetch;
  for (const alias of ["../x", "a/b", "a?b", ""]) {
    assert.throws(() => criarClienteYampi({ alias, token: TOKEN, secretKey: CHAVE_SECRETA, fetchImpl }), erroCom(0));
  }
  assert.equal(chamadas, 0);
});

test("401 e 404 não repetem: YampiErro com o status", async () => {
  for (const status of [401, 404, 422]) {
    const { c, pedidos } = cliente([json({ message: "não" }, status)]);
    await assert.rejects(c.get("/orders"), erroCom(status));
    assert.equal(pedidos.length, 1, String(status));
  }
});

test("429 com Retry-After espera e repete uma vez; o segundo 429 vira YampiErro 429", async () => {
  const { c, esperas, pedidos } = cliente([json({}, 429, { "retry-after": "1" }), json({ data: [1] })]);
  assert.deepEqual(await c.get("/orders"), { data: [1] });
  assert.deepEqual(esperas, [1000]);
  assert.equal(pedidos.length, 2);
  const outro = cliente([json({}, 429, { "retry-after": "1" }), json({}, 429, { "retry-after": "1" })]);
  await assert.rejects(outro.c.get("/orders"), erroCom(429));
  assert.equal(outro.pedidos.length, 2);
});

test("429 sem Retry-After espera 2 s", async () => {
  const { c, esperas } = cliente([json({}, 429), json({ ok: 1 })]);
  await c.get("/orders");
  assert.deepEqual(esperas, [2000]);
});

test("Retry-After acima de 10 s: não espera, YampiErro 429 na hora com retryAfterMs", async () => {
  const { c, esperas } = cliente([json({}, 429, { "retry-after": "30" })]);
  await assert.rejects(c.get("/orders"), erroCom(429, 30_000));
  assert.deepEqual(esperas, []);
});

test("X-RateLimit-Remaining 0 adia a chamada seguinte até o fim da janela (Retry-After, ou 60 s sem ele)", async () => {
  const { c, esperas, pedidos } = cliente([json({ data: [] }, 200, { "x-ratelimit-remaining": "0", "retry-after": "2" }), json({ data: [] })]);
  await c.get("/orders");
  await c.get("/orders");
  assert.deepEqual(esperas, [2000]);
  assert.equal(pedidos.length, 2);
  // Sem Retry-After a janela é de 60 s, maior que 10 s: a segunda chamada lança sem esperar nem chamar.
  const sem = cliente([json({ data: [] }, 200, { "x-ratelimit-remaining": "0" }), json({ data: [] })]);
  await sem.c.get("/orders");
  await assert.rejects(sem.c.get("/orders"), erroCom(429, 60_000));
  assert.deepEqual([sem.esperas, sem.pedidos.length], [[], 1]);
});

test("Remaining acima de zero não adia nada", async () => {
  const { c, esperas } = cliente([json({}, 200, { "x-ratelimit-remaining": "58" }), json({})]);
  await c.get("/orders");
  await c.get("/orders");
  assert.deepEqual(esperas, []);
});

test("5xx e rede: duas novas tentativas (1 s e 3 s); depois YampiErro com o status, ou 0 sem resposta", async () => {
  const { c, esperas } = cliente([json({}, 500), json({}, 502), json({ ok: 1 })]);
  assert.deepEqual(await c.get("/x"), { ok: 1 });
  assert.deepEqual(esperas, [1000, 3000]);
  const tres = cliente([json({}, 503), json({}, 503), json({}, 503)]);
  await assert.rejects(tres.c.get("/x"), erroCom(503));
  const rede = cliente([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
  await assert.rejects(rede.c.get("/x"), erroCom(0));
  assert.equal(rede.pedidos.length, 3);
});

test("o erro nunca carrega token, chave nem o corpo da resposta, e a mensagem não leva a consulta", async () => {
  const rede = cliente([1, 2, 3].map(() => new TypeError(`Invalid header value: ${TOKEN}`)));
  const erro = await rede.c.get("/orders", { search: "fulana@exemplo.com" }).catch((e: Error) => e);
  assert.ok(erro instanceof YampiErro);
  assert.doesNotMatch(erro.message, new RegExp(`${TOKEN}|${CHAVE_SECRETA}|fulana`));
  const corpo500 = cliente([json({ email: "fulana@exemplo.com" }, 500), json({}, 500), json({}, 500)]);
  const erro500 = await corpo500.c.get("/orders?search=fulana").catch((e: Error) => e);
  assert.ok(erro500 instanceof YampiErro);
  assert.doesNotMatch(erro500.message, /fulana/);
  assert.match(erro500.message, /HTTP 500 em \/orders$/);
});

test("post manda JSON; apagar aceita 204; resposta que não é JSON vira YampiErro 502", async () => {
  const { c, pedidos } = cliente([json({ data: { id: 7 } }), new Response(null, { status: 204 }), new Response("<html>", { status: 200 })]);
  assert.deepEqual(await c.post("/webhooks", { name: "Girumo" }), { data: { id: 7 } });
  assert.deepEqual([pedidos[0].init.method, pedidos[0].init.headers["Content-Type"], pedidos[0].init.body], ["POST", "application/json", '{"name":"Girumo"}']);
  await c.apagar("/webhooks/7");
  assert.deepEqual([pedidos[1].init.method, pedidos[1].url], ["DELETE", "https://api.dooki.com.br/v2/loja-exemplo/webhooks/7"]);
  await assert.rejects(c.get("/orders"), erroCom(502));
});

test("POST não repete em 5xx nem em falha de rede (a 1ª pode ter criado o aviso); 429 repete, porque não foi processado", async () => {
  for (const falha of [json({}, 503), new Error("ECONNRESET")]) {
    const { c, pedidos, esperas } = cliente([falha, json({ data: { id: 1 } })]);
    await assert.rejects(c.post("/webhooks", { name: "Girumo" }), erroCom(falha instanceof Response ? 503 : 0));
    assert.deepEqual([pedidos.length, esperas], [1, []]);
  }
  const limite = cliente([json({}, 429, { "retry-after": "1" }), json({ data: { id: 1 } })]);
  assert.deepEqual(await limite.c.post("/webhooks", {}), { data: { id: 1 } });
  assert.equal(limite.pedidos.length, 2);
});

test("caminho com `..`, `.`, `#` ou segmento vazio nunca chega ao fetch; a consulta separada continua valendo", async () => {
  for (const caminho of ["/webhooks/..", "/./orders", "/orders#x", "//orders", "orders", "/orders/", ""]) {
    const { c, pedidos } = cliente([json({})]);
    await assert.rejects(c.apagar(caminho), /caminho inválido/, caminho);
    assert.equal(pedidos.length, 0, caminho);
  }
  const { c, pedidos } = cliente([json({ data: [] })]);
  await c.get("/search/orders", { q: "1" });
  assert.equal(pedidos[0].url, "https://api.dooki.com.br/v2/loja-exemplo/search/orders?q=1");
});
