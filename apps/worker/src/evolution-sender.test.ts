import assert from "node:assert/strict";
import test from "node:test";

import { createEvolutionSender, EvolutionSendError } from "./evolution-sender.js";

type Captured = { url: string; init: RequestInit };

function fakeFetch(response: Response, captured?: Captured[]) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    captured?.push({ url, init });
    return response;
  };
}

function ok(): Response {
  return new Response(JSON.stringify({ key: { id: "abc" } }), { status: 201 });
}

test("sendText: POST /message/sendText/{instance} com { number, text } e apikey", async () => {
  const captured: Captured[] = [];
  const sender = createEvolutionSender({
    baseUrl: "https://wa.example.com/",
    apiKey: "secret-key",
    fetchImpl: fakeFetch(ok(), captured),
  });

  await sender.sendText("gr_abc", "5511999990002", "olá");

  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://wa.example.com/message/sendText/gr_abc");
  assert.equal(captured[0].init.method, "POST");
  const headers = captured[0].init.headers as Record<string, string>;
  assert.equal(headers.apikey, "secret-key");
  assert.deepEqual(JSON.parse(captured[0].init.body as string), { number: "5511999990002", text: "olá" });
});

test("sendText: baseUrl sem barra final também funciona (encodeURIComponent no instanceName)", async () => {
  const captured: Captured[] = [];
  const sender = createEvolutionSender({
    baseUrl: "https://wa.example.com",
    apiKey: "k",
    fetchImpl: fakeFetch(ok(), captured),
  });
  await sender.sendText("gr a/b", "551199", "x");
  assert.equal(captured[0].url, "https://wa.example.com/message/sendText/gr%20a%2Fb");
});

test("sendText: HTTP não-ok vira EvolutionSendError com o status", async () => {
  const sender = createEvolutionSender({
    baseUrl: "https://wa.example.com",
    apiKey: "k",
    fetchImpl: fakeFetch(new Response("bad number", { status: 400 })),
  });
  await assert.rejects(
    () => sender.sendText("gr_abc", "x", "y"),
    (err: unknown) => err instanceof EvolutionSendError && err.status === 400,
  );
});

test("sendText: erro de rede vira EvolutionSendError status 0", async () => {
  const sender = createEvolutionSender({
    baseUrl: "https://wa.example.com",
    apiKey: "k",
    fetchImpl: async () => {
      throw new Error("boom");
    },
  });
  await assert.rejects(
    () => sender.sendText("gr_abc", "x", "y"),
    (err: unknown) => err instanceof EvolutionSendError && err.status === 0,
  );
});
