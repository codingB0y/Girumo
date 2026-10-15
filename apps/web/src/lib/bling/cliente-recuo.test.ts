import assert from "node:assert/strict";
import { test } from "node:test";

import { erroBling, json, limiteDoDia, limiteDoSegundo, montar, porPrazo } from "@/test/bling-cliente-falso";

/**
 * O cliente HTTP do Bling quando o Bling não responde bem: o recuo do 429 (e a cota do dia), as
 * novas tentativas do 5xx, da rede e do timeout, e o prazo da execução, que nenhuma espera passa.
 */

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

test("timeoutMs aborta de verdade a chamada que não responde", async (t) => {
  // AbortSignal.timeout usa um timer sem ref: sem outro handle vivo, o processo de teste termina
  // antes de o timeout disparar (aconteceu no CI Linux, e cancelou o resto do arquivo). O intervalo
  // segura o laço de eventos só durante este teste.
  const vivo = setInterval(() => {}, 1_000);
  t.after(() => clearInterval(vivo));
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

test("timeout que o prazo encolheu abortou a chamada: prazo esgotado na hora; o timeout cheio continua transitório", async (t) => {
  // O sinal já nasce abortado: é o timeout disparando, sem esperar segundos de verdade.
  const tempos: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    tempos.push(ms);
    return AbortSignal.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
  });
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    throw init?.signal?.reason ?? new Error("fetch sem sinal");
  }) as typeof fetch;

  // Faltam 5 s para o prazo: a chamada teve 5 s, não 15. Mutante: tratar como rede queimaria uma
  // tentativa do pedido e um passo do disjuntor por causa do orçamento.
  const encolhido = montar([], { fetchImpl, prazo: 5_000 });
  await assert.rejects(encolhido.cliente.get("/pedidos/vendas/1"), porPrazo);
  assert.deepEqual([tempos, encolhido.esperas], [[5_000], []]);

  // Com folga, o timeout é o de sempre (15 s): abortar é o Bling lento, e as novas tentativas valem.
  tempos.length = 0;
  const cheio = montar([], { fetchImpl, prazo: 60_000 });
  await assert.rejects(cheio.cliente.get("/pedidos/vendas/1"), erroBling("transitorio", null));
  assert.deepEqual([tempos, cheio.esperas], [[15_000, 15_000, 15_000], [1_000, 3_000]]);
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

test("prazo da chamada: vale o menor entre ele e o do cliente, no timeout e no recuo", async (t) => {
  const tempos: number[] = [];
  const original = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    tempos.push(ms);
    return original(ms);
  });
  await montar([json(200, {})], { prazo: 60_000 }).cliente.get("/a", undefined, 4_000);
  await montar([json(200, {})], { prazo: 3_000 }).cliente.get("/b", undefined, 60_000);
  await montar([json(200, {})]).cliente.get("/c", undefined, 6_000);
  assert.deepEqual(tempos, [4_000, 3_000, 6_000]);

  // A página da varredura com o prazo dela (1,5 s) num cliente de 60 s: 5xx → 1 s cabe, 3 s não.
  const falha = () => new Response("x", { status: 503 });
  const pagina = montar([falha(), falha(), falha()], { prazo: 60_000 });
  await assert.rejects(pagina.cliente.get("/pedidos/vendas", { pagina: 1 }, 1_500), porPrazo);
  assert.deepEqual([pagina.chamadas.length, pagina.esperas], [2, [1_000]]);
  // O prazo da chamada já passou: nem chama.
  const passou = montar([json(200, {})], { prazo: 60_000 });
  await assert.rejects(passou.cliente.get("/pedidos/vendas", { pagina: 1 }, 0), porPrazo);
  assert.equal(passou.chamadas.length, 0);
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
