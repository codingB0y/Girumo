import assert from "node:assert/strict";
import { test } from "node:test";

import { executarHomologacao, type EntradaHomologacao } from "./homologacao";

/**
 * O teste técnico da homologação do Bling (developer.bling.com.br/homologacao): GET, POST, PUT, PATCH e DELETE em
 * /homologacao/produtos, cada um com o hash `x-bling-homologacao` da resposta anterior, em até 10 s no total e 2 s
 * entre chamadas. Num dos passos o Bling invalida o access token: renova e repete aquele passo.
 */

type Chamada = { metodo: string; caminho: string; hash: string | null; token: string | null; corpo: unknown };

const PRODUTO = { nome: "Copo do Bling", preco: 32.56, codigo: "COD-4587" };
const ID = 16842381880;

/** O Bling da homologação: confere o hash de cada passo e, no `passoQueInvalida`, recusa o token velho uma vez. */
function blingDaHomologacao(opcoes: { passoQueInvalida?: number; respostas?: Record<number, Response> } = {}) {
  const chamadas: Chamada[] = [];
  let passo = 0;
  let invalidou = false;
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const headers = new Headers(init?.headers);
    const chamada = {
      metodo: init?.method ?? "GET",
      caminho: url.pathname.replace(/^\/Api\/v3/, ""),
      hash: headers.get("x-bling-homologacao"),
      token: headers.get("authorization"),
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    chamadas.push(chamada);
    const forcada = opcoes.respostas?.[passo];
    if (forcada) return forcada;
    if (opcoes.passoQueInvalida === passo && !invalidou) {
      invalidou = true;
      return Response.json({ error: { type: "invalid_token" } }, { status: 401 });
    }
    // Cada passo espera o hash do anterior (o 1º não leva hash).
    const esperado = passo === 0 ? null : `hash-${passo - 1}`;
    if (chamada.hash !== esperado) return Response.json({ error: { message: "hash" } }, { status: 400 });
    const corpos = [PRODUTO, { ...PRODUTO, id: ID }, null, null, null];
    const status = [200, 201, 200, 200, 204][passo];
    // O último passo não precisa devolver hash (não há seguinte): o falso não devolve.
    const comHash: Record<string, string> = passo === 4 ? {} : { "x-bling-homologacao": `hash-${passo}` };
    const resposta = corpos[passo] === null || status === 204
      ? new Response(null, { status, headers: comHash })
      : Response.json({ data: corpos[passo] }, { status, headers: comHash });
    passo += 1;
    return resposta;
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

function entrada(fetchImpl: typeof fetch, extra: Partial<EntradaHomologacao> = {}): EntradaHomologacao & { renovacoes: () => number } {
  let token = "access-1";
  let renovacoes = 0;
  let relogio = 0;
  return {
    fetchImpl,
    token: () => token,
    renovar: async () => {
      renovacoes += 1;
      token = `access-${renovacoes + 1}`;
    },
    agora: () => (relogio += 100),
    renovacoes: () => renovacoes,
    ...extra,
  };
}

test("os 5 passos na ordem, cada um com o hash do anterior e o corpo da doc; ok com o tempo de cada passo", async () => {
  const { fetchImpl, chamadas } = blingDaHomologacao();
  const r = await executarHomologacao(entrada(fetchImpl));

  assert.equal(r.ok, true, r.erro ?? "");
  assert.deepEqual(
    chamadas.map((c) => [c.metodo, c.caminho, c.hash]),
    [
      ["GET", "/homologacao/produtos", null],
      ["POST", "/homologacao/produtos", "hash-0"],
      ["PUT", `/homologacao/produtos/${ID}`, "hash-1"],
      ["PATCH", `/homologacao/produtos/${ID}/situacoes`, "hash-2"],
      ["DELETE", `/homologacao/produtos/${ID}`, "hash-3"],
    ],
  );
  // POST com os dados do GET; PUT só troca o nome; PATCH muda a situação.
  assert.deepEqual(chamadas[1].corpo, PRODUTO);
  assert.deepEqual(chamadas[2].corpo, { ...PRODUTO, nome: "Copo" });
  assert.deepEqual(chamadas[3].corpo, { situacao: "I" });
  assert.ok(chamadas.every((c) => c.token === "Bearer access-1"));
  assert.deepEqual(r.passos.map((p) => [p.passo, p.status]), [["GET", 200], ["POST", 201], ["PUT", 200], ["PATCH", 200], ["DELETE", 204]]);
});

test("o Bling invalida o access token num passo: renova uma vez e repete aquele passo, com o mesmo hash e o token novo", async () => {
  const { fetchImpl, chamadas } = blingDaHomologacao({ passoQueInvalida: 2 });
  const e = entrada(fetchImpl);
  const r = await executarHomologacao(e);

  assert.equal(r.ok, true, r.erro ?? "");
  assert.equal(e.renovacoes(), 1);
  const puts = chamadas.filter((c) => c.metodo === "PUT");
  assert.deepEqual(puts.map((c) => [c.hash, c.token]), [["hash-1", "Bearer access-1"], ["hash-1", "Bearer access-2"]]);
  assert.equal(chamadas.at(-1)?.token, "Bearer access-2");
  const put = r.passos.find((p) => p.passo === "PUT");
  assert.equal(put?.renovou, true);
  // O tempo da renovação e o intervalo até a chamada: os 2 s do Bling entre chamadas são o risco desse passo.
  assert.ok((put?.renovacaoMs ?? 0) > 0);
  assert.equal(put?.hashNo401, false);
  assert.ok(r.passos.every((p) => typeof p.intervaloMs === "number"));
  assert.equal(r.passos[0].intervaloMs, 0);
});

test("o 401 que trouxe hash fica registrado (a doc não diz qual hash vale depois dele)", async () => {
  let n = 0;
  const fetchImpl = (async () => {
    n += 1;
    if (n === 1) return Response.json({ data: PRODUTO }, { headers: { "x-bling-homologacao": "h0" } });
    if (n === 2) return Response.json({ error: {} }, { status: 401, headers: { "x-bling-homologacao": "h-401" } });
    return Response.json({ data: { ...PRODUTO, id: ID } }, { status: 201, headers: { "x-bling-homologacao": `h${n}` } });
  }) as unknown as typeof fetch;
  const r = await executarHomologacao(entrada(fetchImpl));
  assert.equal(r.passos.find((p) => p.passo === "POST")?.hashNo401, true);
});

test("renova uma vez por teste: 401 no GET renova, e outro 401 depois (no PUT) para sem renovar de novo", async () => {
  let n = 0;
  const fetchImpl = (async () => {
    n += 1;
    if (n === 1) return Response.json({ error: {} }, { status: 401 });
    if (n === 2) return Response.json({ data: PRODUTO }, { headers: { "x-bling-homologacao": "h0" } });
    if (n === 3) return Response.json({ data: { ...PRODUTO, id: ID } }, { status: 201, headers: { "x-bling-homologacao": "h1" } });
    return Response.json({ error: {} }, { status: 401 });
  }) as unknown as typeof fetch;
  const e = entrada(fetchImpl);
  const r = await executarHomologacao(e);
  assert.equal(r.ok, false);
  assert.equal(e.renovacoes(), 1);
  assert.match(r.erro ?? "", /PUT.*401/);
});

test("a renovação lançando (barrada, recusada): para naquele passo com a mensagem", async () => {
  const { fetchImpl } = blingDaHomologacao({ passoQueInvalida: 1 });
  const r = await executarHomologacao(entrada(fetchImpl, { renovar: async () => { throw new Error("renovação barrada"); } }));
  assert.equal(r.ok, false);
  assert.match(r.erro ?? "", /POST: a renovação do acesso falhou: renovação barrada/);
  assert.deepEqual(r.passos.map((p) => [p.passo, p.status]), [["GET", 200], ["POST", 401]]);
});

test("401 de novo depois de renovar: para, sem renovar outra vez (o balde de /oauth/token é de todas as lojas)", async () => {
  const recusa = () => Response.json({ error: {} }, { status: 401 });
  let n = 0;
  const fetchImpl = (async () => (n++ === 0 ? Response.json({ data: PRODUTO }, { headers: { "x-bling-homologacao": "h" } }) : recusa())) as unknown as typeof fetch;
  const e = entrada(fetchImpl);
  const r = await executarHomologacao(e);

  assert.equal(r.ok, false);
  assert.equal(e.renovacoes(), 1);
  assert.match(r.erro ?? "", /POST.*401/);
});

test("passo recusado (4xx) ou sem o hash: para nele, com o status e a mensagem do Bling, sem token nem corpo inteiro", async () => {
  const recusa = Response.json({ error: { message: "Hash inválido", description: "x" } }, { status: 400 });
  const { fetchImpl } = blingDaHomologacao({ respostas: { 1: recusa } });
  const r = await executarHomologacao(entrada(fetchImpl));
  assert.equal(r.ok, false);
  assert.equal(r.passos.length, 2);
  assert.match(r.erro ?? "", /POST.*400.*Hash inválido/);
  assert.ok(!(r.erro ?? "").includes("access-1"));

  const semHash = Response.json({ data: PRODUTO });
  const outro = blingDaHomologacao({ respostas: { 0: semHash } });
  const r2 = await executarHomologacao(entrada(outro.fetchImpl));
  assert.equal(r2.ok, false);
  assert.match(r2.erro ?? "", /GET.*x-bling-homologacao/);
  assert.equal(outro.chamadas.length, 1);
});

test("passou dos 10 s no total: falha dizendo o tempo (o Bling recusaria do lado dele)", async () => {
  const { fetchImpl } = blingDaHomologacao();
  let relogio = 0;
  const r = await executarHomologacao(entrada(fetchImpl, { agora: () => (relogio += 2_500) }));
  assert.equal(r.ok, false);
  assert.match(r.erro ?? "", /10 s/);
});

test("rede caindo num passo: para nele com a mensagem do erro", async () => {
  let n = 0;
  const fetchImpl = (async () => {
    if (n++ === 0) return Response.json({ data: PRODUTO }, { headers: { "x-bling-homologacao": "h" } });
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const r = await executarHomologacao(entrada(fetchImpl));
  assert.equal(r.ok, false);
  assert.match(r.erro ?? "", /POST.*fetch failed/);
});
