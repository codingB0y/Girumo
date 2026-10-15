import assert from "node:assert/strict";
import { test } from "node:test";

import { ate, erroBling, json, limiteDoSegundo, montar, type Extra } from "@/test/bling-cliente-falso";

/**
 * O cliente HTTP do Bling no 401: uma renovação, uma de cada vez (o refresh rotaciona), e o 401 que
 * volta depois de renovar como incidente do Bling, não acesso revogado.
 */

test("401: renova uma vez e repete com o token novo, respeitando o ritmo", async () => {
  const { cliente, chamadas, esperas, renovacoes } = montar([json(401, { error: "invalid_token" }), json(200, { data: 1 })]);
  assert.deepEqual(await cliente.get("/pedidos/vendas/1"), { data: 1 });
  assert.equal(renovacoes(), 1);
  assert.equal(chamadas[0].headers.authorization, "Bearer tok-1");
  assert.equal(chamadas[1].headers.authorization, "Bearer tok-renovado-1");
  assert.deepEqual(esperas, [350]);
});

test("401 de novo depois de renovar → transitorio 401, sem segunda renovação", async () => {
  // A renovação deu certo: a concessão está viva. O 401 seguinte é incidente do Bling (ou proxy/WAF),
  // não acesso revogado. Mutante: `auth` aqui marca a loja para reconectar e manda e-mail à toa.
  const { cliente, chamadas, renovacoes } = montar([json(401, {}), json(401, {})]);
  await assert.rejects(cliente.get("/pedidos/vendas/1"), erroBling("transitorio", 401));
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
  await assert.rejects(recusa.cliente.get("/x"), erroBling("transitorio", 401));
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
  // O 429 no meio não devolve a renovação: o segundo 401 já é depois de renovar (transitório).
  const dois401 = montar([json(401, {}), limiteDoSegundo(), json(401, {})]);
  await assert.rejects(dois401.cliente.get("/x"), erroBling("transitorio", 401));
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
