import assert from "node:assert/strict";
import { test } from "node:test";

import { BLING_API_BASE, criarClienteBling, ErroBling, type OpcoesCliente, type TipoErroBling } from "./cliente";

type Chamada = { url: string; headers: Record<string, string>; signal: unknown; em: number };

/**
 * Relógio e fetch falsos. `esperar` avança o relógio na hora (ninguém dorme de verdade);
 * com `congelado`, só registra a espera — é o que mostra as vezes reservadas em paralelo.
 */
function montar(respostas: Array<Response | Error>, extra: Partial<OpcoesCliente> & { congelado?: boolean } = {}) {
  let t = 0;
  const esperas: number[] = [];
  const chamadas: Chamada[] = [];
  const tokens: string[] = [];
  let renovacoes = 0;
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(entrada), headers: Object.fromEntries(new Headers(init?.headers).entries()), signal: init?.signal, em: t });
    const r = respostas.shift();
    if (r === undefined) throw new Error("fetch falso: acabaram as respostas");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  const { congelado, ...opcoes } = extra;
  const cliente = criarClienteBling({
    token: async () => {
      tokens.push("tok-1");
      return "tok-1";
    },
    renovar: async () => {
      renovacoes += 1;
      return `tok-renovado-${renovacoes}`;
    },
    fetchImpl,
    agora: () => t,
    esperar: async (ms) => {
      esperas.push(ms);
      if (!congelado) t += ms;
    },
    ...opcoes,
  });
  return { cliente, esperas, chamadas, tokens, renovacoes: () => renovacoes };
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function erroBling(tipo: TipoErroBling, status: number | null) {
  return (e: unknown) => e instanceof ErroBling && e.tipo === tipo && e.status === status;
}

test("GET com Bearer, enable-jwt e Accept JSON; lista vira chave[]= e undefined some", async () => {
  const { cliente, chamadas, tokens } = montar([json(200, { data: [{ id: 1 }] })]);
  const resposta = await cliente.get("/pedidos/vendas", {
    pagina: 2,
    idsSituacoes: [6, 9],
    dataAlteracaoInicial: "2026-10-13 10:00:00",
    dataFinal: undefined,
    vazia: [],
  });
  assert.deepEqual(resposta, { data: [{ id: 1 }] });
  assert.equal(
    chamadas[0].url,
    `${BLING_API_BASE}/pedidos/vendas?pagina=2&idsSituacoes[]=6&idsSituacoes[]=9&dataAlteracaoInicial=2026-10-13%2010%3A00%3A00`,
  );
  assert.equal(chamadas[0].headers.authorization, "Bearer tok-1");
  assert.equal(chamadas[0].headers["enable-jwt"], "1");
  assert.equal(chamadas[0].headers.accept, "application/json");
  assert.ok(chamadas[0].signal instanceof AbortSignal);
  assert.deepEqual(tokens, ["tok-1"]);
});

test("sem query, a URL é só base + caminho", async () => {
  const { cliente, chamadas } = montar([json(200, { data: {} })]);
  await cliente.get("/empresas/me/dados-basicos");
  assert.equal(chamadas[0].url, "https://api.bling.com.br/Api/v3/empresas/me/dados-basicos");
});

test("2xx: 204 ou corpo vazio → null; corpo que não é JSON → invalido", async () => {
  const { cliente } = montar([new Response(null, { status: 204 }), new Response("", { status: 200 }), new Response("<html>", { status: 200 })]);
  assert.equal(await cliente.get("/a"), null);
  assert.equal(await cliente.get("/b"), null);
  await assert.rejects(cliente.get("/c"), erroBling("invalido", 200));
});

test("ritmo: 350 ms entre o início de duas chamadas (intervaloMs configurável)", async () => {
  const { cliente, esperas, chamadas } = montar([json(200, {}), json(200, {}), json(200, {}), json(200, {})]);
  await cliente.get("/1");
  await cliente.get("/2");
  await cliente.get("/3");
  assert.deepEqual(esperas, [350, 350]);
  assert.deepEqual(chamadas.map((c) => c.em), [0, 350, 700]);
  const outro = montar([json(200, {}), json(200, {})], { intervaloMs: 1000 });
  await outro.cliente.get("/1");
  await outro.cliente.get("/2");
  assert.deepEqual(outro.esperas, [1000]);
});

test("ritmo em paralelo: cada chamada reserva a sua vez (0, 350, 700), não a mesma", async () => {
  const { cliente, esperas } = montar([json(200, {}), json(200, {}), json(200, {})], { congelado: true });
  await Promise.all([cliente.get("/1"), cliente.get("/2"), cliente.get("/3")]);
  assert.deepEqual(esperas, [350, 700]);
});

test("429: espera 1 s, 2 s, 4 s e tenta de novo; persistiu → limite", async () => {
  const limite = () => json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite de requisições atingido.", limit: 3, period: "second" } });
  const { cliente, esperas, chamadas } = montar([limite(), limite(), limite(), limite()]);
  await assert.rejects(cliente.get("/pedidos/vendas"), erroBling("limite", 429));
  assert.equal(chamadas.length, 4);
  assert.deepEqual(esperas, [1000, 2000, 4000]);
  const passa = montar([limite(), limite(), json(200, { data: [] })]);
  assert.deepEqual(await passa.cliente.get("/pedidos/vendas"), { data: [] });
  assert.deepEqual(passa.esperas, [1000, 2000]);
});

test("5xx, rede e timeout: 2 novas tentativas (1 s, 3 s); persistiu → transitorio", async () => {
  const casos: Array<[() => Response | Error, number | null]> = [
    [() => new Response("x", { status: 500 }), 500],
    [() => new Response("x", { status: 503 }), 503],
    [() => new TypeError("fetch failed"), null],
    [() => new DOMException("The operation was aborted due to timeout", "TimeoutError"), null],
  ];
  for (const [falha, status] of casos) {
    const { cliente, esperas, chamadas } = montar([falha(), falha(), falha()]);
    await assert.rejects(cliente.get("/contatos/1"), erroBling("transitorio", status));
    assert.equal(chamadas.length, 3);
    assert.deepEqual(esperas, [1000, 3000]);
  }
  const passa = montar([new TypeError("fetch failed"), json(200, { data: { id: 1 } })]);
  assert.deepEqual(await passa.cliente.get("/contatos/1"), { data: { id: 1 } });
  assert.deepEqual(passa.esperas, [1000]);
});

test("429 e 5xx têm contas separadas", async () => {
  const { cliente, esperas } = montar([json(429, {}), new Response("x", { status: 502 }), json(429, {}), json(200, { ok: 1 })]);
  assert.deepEqual(await cliente.get("/x"), { ok: 1 });
  assert.deepEqual(esperas, [1000, 1000, 2000]);
});

test("401: renova uma vez e repete com o token novo, respeitando o ritmo", async () => {
  const { cliente, chamadas, esperas, renovacoes } = montar([json(401, { error: "invalid_token" }), json(200, { data: 1 })]);
  assert.deepEqual(await cliente.get("/pedidos/vendas/1"), { data: 1 });
  assert.equal(renovacoes(), 1);
  assert.equal(chamadas[0].headers.authorization, "Bearer tok-1");
  assert.equal(chamadas[1].headers.authorization, "Bearer tok-renovado-1");
  assert.deepEqual(esperas, [350]);
});

test("401 de novo depois de renovar → auth, sem segunda renovação", async () => {
  const { cliente, chamadas, renovacoes } = montar([json(401, {}), json(401, {})]);
  await assert.rejects(cliente.get("/pedidos/vendas/1"), erroBling("auth", 401));
  assert.equal(chamadas.length, 2);
  assert.equal(renovacoes(), 1);
});

test("falha do renovar sobe como está", async () => {
  const falha = new Error("concessão recusada");
  const { cliente, chamadas } = montar([json(401, {})], {
    renovar: async () => {
      throw falha;
    },
  });
  await assert.rejects(cliente.get("/x"), (e: unknown) => e === falha);
  assert.equal(chamadas.length, 1);
});

test("403 → escopo; 404 → nao_encontrado; outro 4xx → invalido, sem tentar de novo", async () => {
  const casos: Array<[Response, TipoErroBling, number]> = [
    [json(403, { error: { type: "FORBIDDEN", message: "Sem permissão" } }), "escopo", 403],
    [json(404, { error: { type: "RESOURCE_NOT_FOUND", message: "Não encontrado" } }), "nao_encontrado", 404],
    [json(400, { error: { type: "VALIDATION_ERROR", message: "Dados inválidos" } }), "invalido", 400],
    [json(422, {}), "invalido", 422],
  ];
  for (const [resposta, tipo, status] of casos) {
    const { cliente, chamadas, esperas } = montar([resposta]);
    await assert.rejects(cliente.get("/pedidos/vendas/9"), erroBling(tipo, status));
    assert.equal(chamadas.length, 1);
    assert.deepEqual(esperas, []);
  }
});

test("invalido leva error.type e message do Bling, nunca o resto do corpo nem o token", async () => {
  const corpo = {
    error: { type: "VALIDATION_ERROR", message: "Não foi possível\nprocessar", description: "Cliente Maria (62) 99999-8888", fields: [{ msg: "x" }] },
  };
  const { cliente } = montar([json(400, corpo)]);
  await assert.rejects(cliente.get("/pedidos/vendas/9"), (e: unknown) => {
    assert.ok(e instanceof ErroBling);
    assert.match(e.message, /VALIDATION_ERROR/);
    assert.match(e.message, /Não foi possível processar/);
    assert.ok(!e.message.includes("Maria") && !e.message.includes("99999") && !e.message.includes("tok-1"), e.message);
    return true;
  });
});

test("token() é lido a cada requisição", async () => {
  const { cliente, tokens } = montar([json(200, {}), json(200, {})]);
  await cliente.get("/1");
  await cliente.get("/2");
  assert.equal(tokens.length, 2);
});
