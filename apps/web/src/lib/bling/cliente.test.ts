import assert from "node:assert/strict";
import { test } from "node:test";

import { corpoGrande, erroBling, json, montar } from "@/test/bling-cliente-falso";

import { BLING_API_BASE, ErroBling, lerTextoComTeto, TETO_RESPOSTA_BYTES, type TipoErroBling } from "./cliente";

/**
 * O cliente HTTP do Bling: o pedido (URL, headers, redirecionamento), o ritmo de 350 ms, a resposta
 * (JSON, corpo grande) e o tipo de cada erro que não se tenta de novo. O recuo e o prazo estão em
 * `cliente-recuo.test.ts`; o 401 e a renovação, em `cliente-401.test.ts`.
 */

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

test("404 com qualquer corpo (proxy, página de erro, vazio) → nao_encontrado, sem tentar de novo", async () => {
  // O 404 falso (proxy) que marca uma venda como excluída se cura sozinho: a varredura reabre a linha
  // `excluido` que a lista do Bling ainda mostra. Mutante: como transitório, o 404 real sem o corpo do
  // Bling deixava a venda apagada de verdade em orders e alimentava o disjuntor.
  const respostas = [
    new Response("<html><body>Not Found</body></html>", { status: 404 }),
    new Response("", { status: 404 }),
    json(404, { message: "Not Found" }),
    json(404, { error: "not_found" }),
  ];
  for (const resposta of respostas) {
    const { cliente, chamadas, esperas } = montar([resposta]);
    await assert.rejects(cliente.get("/pedidos/vendas/9"), erroBling("nao_encontrado", 404));
    assert.equal(chamadas.length, 1);
    assert.deepEqual(esperas, []);
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
