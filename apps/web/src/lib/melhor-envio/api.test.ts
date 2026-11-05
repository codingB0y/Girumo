import assert from "node:assert/strict";
import { test } from "node:test";

import { TETO_RESPOSTA_BYTES } from "@/lib/bling/cliente";

import { contaDoToken, ErroMelhorEnvio, ME_API, paginaDeEtiquetas } from "./api";
import { USER_AGENT_ME } from "./oauth";

type Chamada = { url: string; headers: Record<string, string>; redirect: unknown };

function fetchFalso(respostas: Array<Response | Error>) {
  const chamadas: Chamada[] = [];
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(entrada), headers: Object.fromEntries(new Headers(init?.headers).entries()), redirect: init?.redirect });
    const r = respostas.shift();
    if (r === undefined) throw new Error("fetch falso: acabaram as respostas");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

test("cabeçalhos e URL", async () => {
  const { fetchImpl, chamadas } = fetchFalso([json({ data: [], last_page: 1 })]);
  await paginaDeEtiquetas("tok", 3, { fetchImpl });
  assert.equal(chamadas[0].url, `${ME_API}/orders?page=3`);
  assert.equal(chamadas[0].headers.authorization, "Bearer tok");
  assert.equal(chamadas[0].headers["user-agent"], USER_AGENT_ME);
  assert.equal(chamadas[0].headers.accept, "application/json");
  assert.equal(chamadas[0].redirect, "error");
});

test("204 é lista vazia", async () => {
  const { fetchImpl } = fetchFalso([new Response(null, { status: 204 })]);
  assert.deepEqual(await paginaDeEtiquetas("tok", 1, { fetchImpl }), { etiquetas: [], ultimaPagina: 0 });
});

test("página com etiquetas; sem last_page vale 1", async () => {
  const corpo = {
    data: [
      { tracking: "AB123456789BR", status: "delivered", created_at: "2026-10-28 09:00:00", updated_at: "2026-11-01 14:32:00", delivered_at: "2026-11-01 14:32:00" },
      "lixo",
      { tracking: null },
    ],
    last_page: 5,
  };
  const { fetchImpl } = fetchFalso([json(corpo), json({ data: [] })]);
  const r = await paginaDeEtiquetas("tok", 1, { fetchImpl });
  assert.equal(r.ultimaPagina, 5);
  assert.deepEqual(r.etiquetas, [
    {
      tracking: "AB123456789BR",
      status: "delivered",
      criadaEm: "2026-10-28T12:00:00.000Z",
      atualizadaEm: "2026-11-01T17:32:00.000Z",
      entregueEm: "2026-11-01T17:32:00.000Z",
    },
  ]);
  assert.equal((await paginaDeEtiquetas("tok", 1, { fetchImpl })).ultimaPagina, 1);
});

test("erro e sem resposta", async () => {
  const { fetchImpl } = fetchFalso([json({ message: "tok-secreto" }, 401), new Error("Bearer tok")]);
  await assert.rejects(paginaDeEtiquetas("tok", 1, { fetchImpl }), (e: unknown) => {
    assert.ok(e instanceof ErroMelhorEnvio);
    assert.equal(e.status, 401);
    assert.equal(e.message, "o Melhor Envio respondeu 401");
    return true;
  });
  await assert.rejects(paginaDeEtiquetas("tok", 1, { fetchImpl }), (e: unknown) => {
    assert.ok(e instanceof ErroMelhorEnvio);
    assert.equal(e.status, 0);
    assert.equal(e.message, "o Melhor Envio não respondeu");
    return true;
  });
});

test("200 com JSON inválido é erro", async () => {
  const { fetchImpl } = fetchFalso([new Response("<html>", { status: 200 })]);
  await assert.rejects(paginaDeEtiquetas("tok", 1, { fetchImpl }), ErroMelhorEnvio);
});

test("conta", async () => {
  const { fetchImpl, chamadas } = fetchFalso([
    json({ firstname: "Ana", lastname: "Souza", email: "ana@exemplo.test" }),
    json({}, 403),
    json({ firstname: "Ana" }),
  ]);
  assert.deepEqual(await contaDoToken("tok", { fetchImpl }), { nome: "Ana Souza", email: "ana@exemplo.test" });
  assert.equal(chamadas[0].url, ME_API);
  await assert.rejects(contaDoToken("tok", { fetchImpl }), (e: unknown) => e instanceof ErroMelhorEnvio && e.status === 403);
  await assert.rejects(contaDoToken("tok", { fetchImpl }), ErroMelhorEnvio);
});

test("token fora do formato seguro é recusado sem chamar a rede", async () => {
  const { fetchImpl, chamadas } = fetchFalso([]);
  await assert.rejects(contaDoToken("tok\r\nX: y", { fetchImpl }), ErroMelhorEnvio);
  assert.equal(chamadas.length, 0);
});

const grande = () => "x".repeat(TETO_RESPOSTA_BYTES + 1);

test("401 com corpo acima do teto mantém o status", async () => {
  const { fetchImpl } = fetchFalso([new Response(grande(), { status: 401 })]);
  await assert.rejects(paginaDeEtiquetas("tok", 1, { fetchImpl }), (e: unknown) => e instanceof ErroMelhorEnvio && e.status === 401);
});

test("200 com corpo acima do teto é erro", async () => {
  const { fetchImpl } = fetchFalso([new Response(grande(), { status: 200 })]);
  await assert.rejects(paginaDeEtiquetas("tok", 1, { fetchImpl }), ErroMelhorEnvio);
});

test("página inválida não chama a rede", async () => {
  const { fetchImpl, chamadas } = fetchFalso([]);
  for (const p of [0, -1, 1.5, Number.NaN]) await assert.rejects(paginaDeEtiquetas("tok", p, { fetchImpl }), ErroMelhorEnvio);
  assert.equal(chamadas.length, 0);
});

test("token acima de 4096 caracteres é recusado sem rede", async () => {
  const { fetchImpl, chamadas } = fetchFalso([]);
  await assert.rejects(contaDoToken("a".repeat(4097), { fetchImpl }), ErroMelhorEnvio);
  assert.equal(chamadas.length, 0);
});

test("limites da conta: e-mail e nomes longos são malformados", async () => {
  const { fetchImpl } = fetchFalso([
    json({ email: `${"a".repeat(250)}@exemplo.test` }),
    json({ firstname: "a".repeat(121), email: "ana@exemplo.test" }),
  ]);
  await assert.rejects(contaDoToken("tok", { fetchImpl }), ErroMelhorEnvio);
  await assert.rejects(contaDoToken("tok", { fetchImpl }), ErroMelhorEnvio);
});

test("tracking acima de 64 caracteres vira null e a etiqueta fica", async () => {
  const { fetchImpl } = fetchFalso([json({ data: [{ tracking: "A".repeat(65), status: "posted" }], last_page: 1 })]);
  const r = await paginaDeEtiquetas("tok", 1, { fetchImpl });
  assert.equal(r.etiquetas.length, 1);
  assert.equal(r.etiquetas[0].tracking, null);
});
