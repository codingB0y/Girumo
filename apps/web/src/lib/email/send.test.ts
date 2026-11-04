import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { remetenteComNome, sendEmail } from "./send";

/**
 * Os dois `console.error` do envio (o Resend recusou, e a exceção): o log diz a falha com o endereço
 * mascarado, nunca inteiro. O registro em public.logs vai para um PostgREST de mentira.
 */

const ENDERECO = "financeiromegastock@gmail.com";
const ENVIO = { to: ENDERECO, subject: "Assunto", html: "<p>oi</p>", tenantId: "loja-1", kind: "bling_reconectar" } as const;

const postgrest = createServer((_req, res) => {
  res.statusCode = 201;
  res.end();
});
const fetchOriginal = globalThis.fetch;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => {
  globalThis.fetch = fetchOriginal;
  postgrest.close();
});

// Primeiro de propósito: depois de criado, o cliente do Resend fica guardado.
test("exceção no envio (sem RESEND_API_KEY): o log mascara o endereço", async (t) => {
  delete process.env.RESEND_API_KEY;
  const erros = t.mock.method(console, "error", () => undefined);
  assert.equal(await sendEmail(ENVIO), false);

  const logado = erros.mock.calls.map((c) => c.arguments.map(String).join(" ")).join("\n");
  assert.match(logado, /\[email\] Exception sending to fi\*\*\*@gmail\.com/);
  assert.doesNotMatch(logado, /financeiromegastock/);
});

test("o Resend recusa o envio: o log mascara o endereço", async (t) => {
  process.env.RESEND_API_KEY = "re_chave_falsa";
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!url.startsWith("https://api.resend.com/")) return fetchOriginal(entrada, init);
    return new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field." }), { status: 422 });
  }) as typeof fetch;
  const erros = t.mock.method(console, "error", () => undefined);
  assert.equal(await sendEmail(ENVIO), false);

  const logado = erros.mock.calls.map((c) => c.arguments.map(String).join(" ")).join("\n");
  assert.match(logado, /\[email\] Failed to send to fi\*\*\*@gmail\.com/);
  assert.doesNotMatch(logado, /financeiromegastock/);
});

const BASE = "Girumo <noreply@girumo.com.br>";

test("remetenteComNome troca só o nome de exibição e não deixa < > \" \ @ nem quebra de linha passar", () => {
  assert.equal(remetenteComNome(BASE, "Loja Exemplo"), '"Loja Exemplo" <noreply@girumo.com.br>');
  assert.equal(remetenteComNome("noreply@girumo.com.br", "Loja Exemplo"), '"Loja Exemplo" <noreply@girumo.com.br>');
  assert.equal(remetenteComNome(BASE, "x".repeat(100)), `"${"x".repeat(60)}" <noreply@girumo.com.br>`);
  assert.equal(
    remetenteComNome(BASE, 'Loja <ceo@banco.test>"\r\nBcc: alguem@x.test'),
    '"Loja ceo banco.test Bcc: alguem x.test" <noreply@girumo.com.br>',
  );
  assert.equal(remetenteComNome(BASE, '<>"\r\n'), BASE);
  assert.equal(remetenteComNome(BASE, undefined), BASE);
});

test("fromName e text chegam ao Resend; sem fromName vale o remetente padrão", async () => {
  process.env.RESEND_API_KEY = "re_chave_falsa";
  const corpos: Array<{ from: string; text?: string }> = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!url.startsWith("https://api.resend.com/")) return fetchOriginal(entrada, init);
    corpos.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as typeof fetch;

  assert.equal(await sendEmail({ ...ENVIO, kind: "rastreio", fromName: "Loja Exemplo", text: "oi" }), true);
  assert.equal(await sendEmail(ENVIO), true);
  assert.match(corpos[0].from, /^"Loja Exemplo" <[^<>]+>$/);
  assert.equal(corpos[0].text, "oi");
  assert.doesNotMatch(corpos[1].from, /Loja Exemplo/);
});
