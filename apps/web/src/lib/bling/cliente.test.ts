import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLING_API_BASE,
  criarClienteBling,
  ErroBling,
  lerTextoComTeto,
  TETO_RESPOSTA_BYTES,
  type OpcoesCliente,
  type TipoErroBling,
} from "./cliente";

type Chamada = { url: string; headers: Record<string, string>; signal: unknown; redirect: unknown; em: number };
type Extra = Partial<OpcoesCliente> & { congelado?: boolean; duracaoFetch?: number };

/**
 * Relógio e fetch falsos. `esperar` avança o relógio na hora (ninguém dorme de verdade);
 * com `congelado`, só registra a espera — é o que mostra as vezes reservadas em paralelo.
 * `duracaoFetch` = quanto cada chamada leva no relógio falso.
 */
function montar(respostas: Array<Response | Error>, extra: Extra = {}) {
  let t = 0;
  const esperas: number[] = [];
  const chamadas: Chamada[] = [];
  const tokens: string[] = [];
  let renovacoes = 0;
  const { congelado, duracaoFetch = 0, ...opcoes } = extra;
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(entrada),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      signal: init?.signal,
      redirect: init?.redirect,
      em: t,
    });
    t += duracaoFetch;
    const r = respostas.shift();
    if (r === undefined) throw new Error("fetch falso: acabaram as respostas");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
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

/** `periodo` só existe no `limite`: os outros tipos têm de vir com null. */
function erroBling(tipo: TipoErroBling, status: number | null, periodo: "segundo" | "dia" | null = null) {
  return (e: unknown) => e instanceof ErroBling && e.tipo === tipo && e.status === status && e.periodo === periodo;
}

const porPrazo = (e: unknown) => erroBling("transitorio", null)(e) && /prazo/.test((e as Error).message);

const limiteDoSegundo = () =>
  json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite de requisições atingido.", limit: 3, period: "second" } });
const limiteDoDia = () =>
  json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite de requisições atingido.", limit: 120000, period: "day" } });

/** Corpo de `megas` pedaços de 1 MB gerados sob demanda: mostra quanto foi lido e se a leitura parou. */
function corpoGrande(status: number, megas: number) {
  const pedaco = new Uint8Array(1024 * 1024).fill(0x61);
  let lidos = 0;
  let cancelado = false;
  const corpo = new ReadableStream<Uint8Array>({
    pull(controle) {
      if (lidos === megas) {
        controle.close();
        return;
      }
      lidos += 1;
      controle.enqueue(pedaco);
    },
    cancel() {
      cancelado = true;
    },
  });
  return { resposta: new Response(corpo, { status }), lidos: () => lidos, cancelado: () => cancelado };
}

/** Deixa o resto do programa andar (fetch falso, leitura do corpo) até `pronto` valer. */
async function ate(pronto: () => boolean) {
  for (let i = 0; i < 1000 && !pronto(); i += 1) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

test("GET com Bearer, enable-jwt e Accept JSON, sem seguir redirecionamento; lista vira chave[]= e undefined some", async () => {
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
  assert.equal(chamadas[0].redirect, "error");
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

test("ritmo é de início a início: chamada que leva 200 ms deixa só 150 ms de espera", async () => {
  const { cliente, esperas, chamadas } = montar([json(200, {}), json(200, {}), json(200, {})], { duracaoFetch: 200 });
  await cliente.get("/1");
  await cliente.get("/2");
  await cliente.get("/3");
  assert.deepEqual(esperas, [150, 150]);
  assert.deepEqual(chamadas.map((c) => c.em), [0, 350, 700]);
});

test("ritmo em paralelo: cada chamada reserva a sua vez (0, 350, 700), não a mesma", async () => {
  const { cliente, esperas } = montar([json(200, {}), json(200, {}), json(200, {})], { congelado: true });
  await Promise.all([cliente.get("/1"), cliente.get("/2"), cliente.get("/3")]);
  assert.deepEqual(esperas, [350, 700]);
});

test("429: espera 1 s, 2 s, 4 s e tenta de novo; persistiu → limite do segundo", async () => {
  const { cliente, esperas, chamadas } = montar([limiteDoSegundo(), limiteDoSegundo(), limiteDoSegundo(), limiteDoSegundo()]);
  await assert.rejects(cliente.get("/pedidos/vendas"), erroBling("limite", 429, "segundo"));
  assert.equal(chamadas.length, 4);
  assert.deepEqual(esperas, [1000, 2000, 4000]);
  const passa = montar([limiteDoSegundo(), limiteDoSegundo(), json(200, { data: [] })]);
  assert.deepEqual(await passa.cliente.get("/pedidos/vendas"), { data: [] });
  assert.deepEqual(passa.esperas, [1000, 2000]);
});

test("429 da cota do dia (period day): limite do dia na hora, sem tentar de novo", async () => {
  const { cliente, esperas, chamadas } = montar([limiteDoDia()]);
  await assert.rejects(cliente.get("/pedidos/vendas"), erroBling("limite", 429, "dia"));
  assert.equal(chamadas.length, 1);
  assert.deepEqual(esperas, []);
  // A cota do dia acabou no meio das novas tentativas do segundo: para ali mesmo.
  const depois = montar([limiteDoSegundo(), limiteDoDia()]);
  await assert.rejects(depois.cliente.get("/pedidos/vendas"), erroBling("limite", 429, "dia"));
  assert.equal(depois.chamadas.length, 2);
  assert.deepEqual(depois.esperas, [1000]);
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

test("timeoutMs aborta de verdade a chamada que não responde", async () => {
  let abortadas = 0;
  const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const sinal = init?.signal;
      if (!sinal) {
        reject(new Error("fetch sem sinal"));
        return;
      }
      sinal.addEventListener("abort", () => {
        abortadas += 1;
        reject(sinal.reason);
      });
    })) as typeof fetch;
  const { cliente } = montar([], { fetchImpl, timeoutMs: 20 });
  await assert.rejects(cliente.get("/x"), erroBling("transitorio", null));
  assert.equal(abortadas, 3);
});

test("timeout de cada chamada: timeoutMs; com prazo, o que sobra dele, nunca menos de 1 s", async (t) => {
  const tempos: number[] = [];
  const original = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    tempos.push(ms);
    return original(ms);
  });
  await montar([json(200, {})]).cliente.get("/a");
  await montar([json(200, {})], { timeoutMs: 5000 }).cliente.get("/b");
  await montar([json(200, {})], { prazo: 3000 }).cliente.get("/c");
  await montar([json(200, {})], { prazo: 400 }).cliente.get("/d");
  await montar([json(200, {})], { prazo: 60_000, timeoutMs: 5000 }).cliente.get("/e");
  assert.deepEqual(tempos, [15000, 5000, 3000, 1000, 5000]);
});

test("prazo: recuo que passaria dele vira transitorio na hora, sem esperar nem chamar", async () => {
  // 429 → 1 s cabe (termina em 1000 < 2500) → 429 → 2 s acabaria em 3000: para.
  const limite = montar([limiteDoSegundo(), limiteDoSegundo(), limiteDoSegundo()], { prazo: 2500 });
  await assert.rejects(limite.cliente.get("/pedidos/vendas"), porPrazo);
  assert.equal(limite.chamadas.length, 2);
  assert.deepEqual(limite.esperas, [1000]);
  // 5xx: 1 s cabe (1000 < 1500), 3 s não.
  const falha = () => new Response("x", { status: 503 });
  const transitorio = montar([falha(), falha(), falha()], { prazo: 1500 });
  await assert.rejects(transitorio.cliente.get("/contatos/1"), porPrazo);
  assert.equal(transitorio.chamadas.length, 2);
  assert.deepEqual(transitorio.esperas, [1000]);
});

test("prazo: a vez do ritmo que cairia nele ou depois, ou prazo já passado, nem chama", async () => {
  const ritmo = montar([json(200, {}), json(200, {})], { prazo: 350 });
  await ritmo.cliente.get("/1");
  await assert.rejects(ritmo.cliente.get("/2"), porPrazo);
  assert.equal(ritmo.chamadas.length, 1);
  assert.deepEqual(ritmo.esperas, []);
  const passou = montar([json(200, {})], { prazo: 0 });
  await assert.rejects(passou.cliente.get("/1"), porPrazo);
  assert.equal(passou.chamadas.length, 0);
  // Folga de sobra: tudo igual a sem prazo.
  const folga = montar([limiteDoSegundo(), json(200, { ok: 1 })], { prazo: 60_000 });
  assert.deepEqual(await folga.cliente.get("/x"), { ok: 1 });
  assert.deepEqual(folga.esperas, [1000]);
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

test("401 com o token já trocado (outra chamada renovou): repete com o atual, sem renovar", async () => {
  let leituras = 0;
  let renovacoes = 0;
  const extra: Extra = {
    token: async () => (leituras++ === 0 ? "tok-1" : "tok-2"),
    renovar: async () => {
      renovacoes += 1;
      return "tok-x";
    },
  };
  const passa = montar([json(401, {}), json(200, { ok: 1 })], extra);
  assert.deepEqual(await passa.cliente.get("/x"), { ok: 1 });
  assert.deepEqual(passa.chamadas.map((c) => c.headers.authorization), ["Bearer tok-1", "Bearer tok-2"]);
  leituras = 0;
  const recusa = montar([json(401, {}), json(401, {})], extra);
  await assert.rejects(recusa.cliente.get("/x"), erroBling("auth", 401));
  assert.equal(recusa.chamadas.length, 2);
  assert.equal(renovacoes, 0);
});

test("401 em chamadas paralelas: uma renovação só, e as duas repetem com o token novo", async () => {
  let renovacoes = 0;
  let soltar: (token: string) => void = () => undefined;
  const lidas: string[] = [];
  const { cliente, chamadas } = montar([json(401, {}), json(401, {}), json(200, { ok: 1 }), json(200, { ok: 1 })], {
    congelado: true,
    token: async () => {
      lidas.push("tok-1");
      return "tok-1";
    },
    // A 2ª renovação (o erro) resolve na hora: o teste falha na contagem em vez de travar.
    renovar: () => {
      renovacoes += 1;
      if (renovacoes > 1) return Promise.resolve("tok-de-novo");
      return new Promise<string>((resolve) => {
        soltar = resolve;
      });
    },
  });
  const ambas = Promise.all([cliente.get("/1"), cliente.get("/2")]);
  // 2 leituras no início + 2 no 401: a 2ª chamada achou a renovação da 1ª em voo.
  await ate(() => lidas.length === 4);
  soltar("tok-novo");
  assert.deepEqual(await ambas, [{ ok: 1 }, { ok: 1 }]);
  assert.equal(renovacoes, 1);
  assert.deepEqual(chamadas.map((c) => c.headers.authorization), ["Bearer tok-1", "Bearer tok-1", "Bearer tok-novo", "Bearer tok-novo"]);
});

test("renovação terminada não é reaproveitada: o próximo 401 renova de novo, mesmo depois de falha", async () => {
  const seguidas = montar([json(401, {}), json(200, {}), json(401, {}), json(200, {})]);
  await seguidas.cliente.get("/a");
  await seguidas.cliente.get("/b");
  assert.equal(seguidas.renovacoes(), 2);
  assert.equal(seguidas.chamadas[3].headers.authorization, "Bearer tok-renovado-2");
  let tentativas = 0;
  const depoisDeFalha = montar([json(401, {}), json(401, {}), json(200, { ok: 1 })], {
    renovar: async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error("renovação falhou");
      return "tok-2";
    },
  });
  await assert.rejects(depoisDeFalha.cliente.get("/a"), /renovação falhou/);
  assert.deepEqual(await depoisDeFalha.cliente.get("/b"), { ok: 1 });
  assert.equal(tentativas, 2);
});

test("401 e 429 misturados: um não gasta a conta do outro", async () => {
  const antes = montar([json(401, {}), limiteDoSegundo(), json(200, { ok: 1 })]);
  assert.deepEqual(await antes.cliente.get("/x"), { ok: 1 });
  assert.equal(antes.renovacoes(), 1);
  assert.deepEqual(antes.esperas, [350, 1000]);
  assert.deepEqual(antes.chamadas.map((c) => c.headers.authorization), ["Bearer tok-1", "Bearer tok-renovado-1", "Bearer tok-renovado-1"]);
  const depois = montar([limiteDoSegundo(), json(401, {}), json(200, { ok: 2 })]);
  assert.deepEqual(await depois.cliente.get("/x"), { ok: 2 });
  assert.deepEqual(depois.esperas, [1000, 350]);
  // O 429 no meio não devolve a renovação: o segundo 401 ainda é auth.
  const dois401 = montar([json(401, {}), limiteDoSegundo(), json(401, {})]);
  await assert.rejects(dois401.cliente.get("/x"), erroBling("auth", 401));
  assert.equal(dois401.renovacoes(), 1);
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

test("403 sem o erro do Bling (WAF, IP bloqueado) → transitorio, não escopo", async () => {
  const respostas = [
    new Response("<html><body>Access denied</body></html>", { status: 403 }),
    new Response("", { status: 403 }),
    json(403, { message: "Forbidden" }),
    json(403, { error: "forbidden" }),
    json(403, { error: ["x"] }),
  ];
  for (const resposta of respostas) {
    const { cliente, chamadas } = montar([resposta]);
    await assert.rejects(cliente.get("/pedidos/vendas/9"), erroBling("transitorio", 403));
    assert.equal(chamadas.length, 1);
  }
});

test("corpo acima de 5 MB: para de ler e vira transitorio (resposta grande), sem tentar de novo", async () => {
  const grande = corpoGrande(200, 50);
  const { cliente, chamadas } = montar([grande.resposta]);
  await assert.rejects(cliente.get("/pedidos/vendas"), (e: unknown) => {
    assert.ok(erroBling("transitorio", null)(e), String(e));
    assert.match((e as Error).message, /resposta grande/);
    return true;
  });
  assert.equal(chamadas.length, 1);
  assert.equal(grande.cancelado(), true);
  assert.ok(grande.lidos() < 10, `leu ${grande.lidos()} MB de 50`);
  assert.equal(TETO_RESPOSTA_BYTES, 5 * 1024 * 1024);
});

test("lerTextoComTeto: lê até o teto (UTF-8 cortado entre pedaços); 1 byte acima → null", async () => {
  const bytes = new TextEncoder().encode("Conceição 💜");
  const byteAByte = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controle) {
          for (const b of bytes) controle.enqueue(Uint8Array.of(b));
          controle.close();
        },
      }),
    );
  assert.equal(await lerTextoComTeto(byteAByte(), bytes.length), "Conceição 💜");
  assert.equal(await lerTextoComTeto(byteAByte(), bytes.length - 1), null);
  assert.equal(await lerTextoComTeto(new Response(null, { status: 204 }), 10), "");
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
