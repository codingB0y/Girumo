import assert from "node:assert/strict";
import test from "node:test";

import { AppRequestError, createAppClient } from "./app-client.js";

type Captured = { url: string; init: RequestInit };

function makeClient(
  respond: (captured: Captured) => Response | Promise<Response>,
  baseUrl = "https://app.girumo.com.br",
): { client: ReturnType<typeof createAppClient>; calls: Captured[] } {
  const calls: Captured[] = [];
  const client = createAppClient({
    baseUrl,
    engineToken: "tok-secreto",
    fetchImpl: async (url, init) => {
      const captured = { url, init };
      calls.push(captured);
      return respond(captured);
    },
  });
  return { client, calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

test("manda os dois headers que a rota exige da engine", async () => {
  // getRouteTenantContext recusa sem x-engine-token, e sem x-tenant-id devolve 400.
  const { client, calls } = makeClient(() => ok([]));

  await client.post("tenant-a", "/api/groups/grow/pending");

  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["x-engine-token"], "tok-secreto");
  assert.equal(headers["x-tenant-id"], "tenant-a");
});

test("o tenant vai no header a cada chamada, nunca fixado no cliente", async () => {
  // O worker é multi-tenant: um cliente compartilhado com tenant preso vazaria
  // job de um lojista para a fila de outro.
  const { client, calls } = makeClient(() => ok([]));

  await client.post("tenant-a", "/api/groups/grow/pending");
  await client.post("tenant-b", "/api/groups/grow/pending");

  const tenants = calls.map((c) => (c.init.headers as Record<string, string>)["x-tenant-id"]);
  assert.deepEqual(tenants, ["tenant-a", "tenant-b"]);
});

test("sem corpo não envia body — a rota pending não lê JSON", async () => {
  const { client, calls } = makeClient(() => ok([]));

  await client.post("tenant-a", "/api/groups/grow/pending");

  assert.equal(calls[0]?.init.body, undefined);
});

test("com corpo serializa em JSON", async () => {
  const { client, calls } = makeClient(() => ok({}));

  await client.post("tenant-a", "/api/groups/grow/ack", { id: "j1", status: "created" });

  assert.equal(calls[0]?.init.body, JSON.stringify({ id: "j1", status: "created" }));
});

test("junta a base à rota sem barra dupla", async () => {
  const { client, calls } = makeClient(() => ok([]), "https://app.girumo.com.br/");

  await client.post("tenant-a", "/api/groups/grow/pending");

  assert.equal(calls[0]?.url, "https://app.girumo.com.br/api/groups/grow/pending");
});

test("status de erro vira AppRequestError preservando o código", async () => {
  // 401 (token errado) e 403 (tenant inativo) precisam ser distinguíveis no log:
  // são causas diferentes e uma delas é config, não bug.
  const { client } = makeClient(() => new Response("Token da engine inválido.", { status: 401 }));

  await assert.rejects(
    () => client.post("tenant-a", "/api/groups/grow/pending"),
    (err: unknown) => err instanceof AppRequestError && err.status === 401,
  );
});

test("falha de rede vira status 0, não se confunde com erro HTTP", async () => {
  const { client } = makeClient(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    () => client.post("tenant-a", "/api/groups/grow/pending"),
    (err: unknown) => err instanceof AppRequestError && err.status === 0,
  );
});

test("o token da engine nunca aparece na mensagem de erro", async () => {
  // É credencial de acesso a QUALQUER tenant; um log de erro é o lugar mais fácil
  // de vazá-la sem ninguém perceber.
  const { client } = makeClient(() => new Response("nope", { status: 500 }));

  const err = await client.post("tenant-a", "/api/x").catch((e: unknown) => e);

  assert.ok(err instanceof Error);
  assert.doesNotMatch(err.message, /tok-secreto/);
});

test("corpo de erro longo é truncado — pode conter dados do tenant", async () => {
  const { client } = makeClient(() => new Response("x".repeat(5000), { status: 500 }));

  const err = await client.post("tenant-a", "/api/x").catch((e: unknown) => e);

  assert.ok(err instanceof Error);
  assert.ok(err.message.length < 400, `mensagem grande demais: ${err.message.length}`);
});
