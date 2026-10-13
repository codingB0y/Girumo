import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLING_REVOKE_URL,
  BLING_TOKEN_URL,
  credenciaisBling,
  ErroOAuthBling,
  renovarToken,
  revogarToken,
  trocarCodigo,
  urlDeAutorizacao,
  type TipoErroOAuth,
} from "./oauth";

const CRED = { clientId: "id-do-app", clientSecret: "segredo-do-app" };
const BASIC = `Basic ${Buffer.from("id-do-app:segredo-do-app").toString("base64")}`;
const AGORA = Date.UTC(2026, 9, 13, 12, 0, 0);

type Chamada = { url: string; metodo: string; headers: Record<string, string>; corpo: string; signal: unknown; redirect: unknown };

function fetchFalso(respostas: Array<Response | Error>) {
  const chamadas: Chamada[] = [];
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(entrada),
      metodo: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      corpo: String(init?.body ?? ""),
      signal: init?.signal,
      redirect: init?.redirect,
    });
    const r = respostas.shift();
    if (r === undefined) throw new Error("fetch falso: acabaram as respostas");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

const TOKENS_OK = { access_token: "jwt.de.acesso", expires_in: 21600, token_type: "Bearer", scope: "x", refresh_token: "refresh-novo" };

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...vars, NODE_ENV: "test" };
}

test("credenciaisBling: as duas variáveis não vazias (aparadas); faltou uma → null", () => {
  assert.deepEqual(credenciaisBling(env({ BLING_CLIENT_ID: " id \n", BLING_CLIENT_SECRET: "seg" })), { clientId: "id", clientSecret: "seg" });
  assert.equal(credenciaisBling(env({ BLING_CLIENT_ID: "id" })), null);
  assert.equal(credenciaisBling(env({ BLING_CLIENT_SECRET: "seg" })), null);
  assert.equal(credenciaisBling(env({ BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "   " })), null);
  assert.equal(credenciaisBling(env({ BLING_CLIENT_ID: "", BLING_CLIENT_SECRET: "seg" })), null);
});

test("urlDeAutorizacao: response_type=code, client_id e state, nada mais", () => {
  assert.equal(
    urlDeAutorizacao("abc123", "st_-x"),
    "https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=abc123&state=st_-x",
  );
});

test("trocarCodigo: POST form com Basic, Accept 1.0 e enable-jwt, sem seguir redirecionamento; credencial nunca no corpo", async () => {
  const { fetchImpl, chamadas } = fetchFalso([json(200, TOKENS_OK)]);
  const tokens = await trocarCodigo("CODE-1", CRED, { fetchImpl, agora: () => AGORA });
  assert.equal(chamadas.length, 1);
  const [c] = chamadas;
  assert.equal(c.url, BLING_TOKEN_URL);
  assert.equal(c.metodo, "POST");
  assert.equal(c.headers.authorization, BASIC);
  assert.equal(c.headers.accept, "1.0");
  assert.equal(c.headers["enable-jwt"], "1");
  assert.equal(c.headers["content-type"], "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(c.corpo)), { grant_type: "authorization_code", code: "CODE-1" });
  assert.ok(!c.corpo.includes("id-do-app") && !c.corpo.includes("segredo-do-app"));
  assert.ok(c.signal instanceof AbortSignal);
  assert.equal(c.redirect, "error");
  assert.deepEqual(tokens, { accessToken: "jwt.de.acesso", refreshToken: "refresh-novo", expiraEm: new Date(AGORA + 21600 * 1000) });
});

test("validade de até 30 dias passa; o token é ASCII visível (JWT com . - _ = +/)", async () => {
  const jwt = "eyJhbGci.eyJzdWIi-_0=.c2ln+/x";
  const { fetchImpl } = fetchFalso([json(200, { ...TOKENS_OK, access_token: jwt, expires_in: 2_592_000 })]);
  const tokens = await trocarCodigo("c", CRED, { fetchImpl, agora: () => AGORA });
  assert.equal(tokens.accessToken, jwt);
  assert.equal(tokens.expiraEm.getTime(), AGORA + 2_592_000 * 1000);
});

test("renovarToken: grant refresh_token com o refresh atual", async () => {
  const { fetchImpl, chamadas } = fetchFalso([json(200, { ...TOKENS_OK, expires_in: "3600" })]);
  const tokens = await renovarToken("refresh-velho", CRED, { fetchImpl, agora: () => AGORA });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(chamadas[0].corpo)), { grant_type: "refresh_token", refresh_token: "refresh-velho" });
  assert.equal(chamadas[0].headers.authorization, BASIC);
  assert.equal(tokens.refreshToken, "refresh-novo");
  assert.equal(tokens.expiraEm.getTime(), AGORA + 3600 * 1000);
});

test("resposta 2xx sem access_token, refresh_token ou expires_in válido → outro", async () => {
  const quebradas: unknown[] = [
    { ...TOKENS_OK, access_token: undefined },
    { ...TOKENS_OK, access_token: "" },
    { ...TOKENS_OK, refresh_token: undefined },
    { ...TOKENS_OK, expires_in: undefined },
    { ...TOKENS_OK, expires_in: 0 },
    { ...TOKENS_OK, expires_in: "muito" },
    // Validade: inteiro positivo de até 30 dias.
    { ...TOKENS_OK, expires_in: 3600.5 },
    { ...TOKENS_OK, expires_in: "3600.5" },
    { ...TOKENS_OK, expires_in: -60 },
    { ...TOKENS_OK, expires_in: 2_592_001 },
    { ...TOKENS_OK, expires_in: true },
    // Token vai em header: espaço, CR/LF ou fora do ASCII visível não passa.
    { ...TOKENS_OK, access_token: "jwt com espaço" },
    { ...TOKENS_OK, access_token: "jwt\r\nX-Injetado: 1" },
    { ...TOKENS_OK, access_token: "jwt\t" },
    { ...TOKENS_OK, refresh_token: "refresh\n" },
    { ...TOKENS_OK, refresh_token: "refresh-é" },
    null,
  ];
  for (const corpo of quebradas) {
    const { fetchImpl } = fetchFalso([json(200, corpo)]);
    await assert.rejects(trocarCodigo("c", CRED, { fetchImpl }), (e: unknown) => e instanceof ErroOAuthBling && e.tipo === "outro");
  }
  const { fetchImpl } = fetchFalso([new Response("<html>ok</html>", { status: 200 })]);
  await assert.rejects(trocarCodigo("c", CRED, { fetchImpl }), (e: unknown) => e instanceof ErroOAuthBling && e.tipo === "outro");
});

test("classificação: 429, 5xx, rede, timeout, invalid_client, concessão morta pelo código e o resto", async () => {
  const casos: Array<[Response | Error, TipoErroOAuth, number | null]> = [
    [json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite de requisições atingido.", limit: 3, period: "second" } }), "limite", 429],
    [json(500, { error: "server_error" }), "transitorio", 500],
    [new Response("Bad Gateway", { status: 502 }), "transitorio", 502],
    [new TypeError("fetch failed"), "transitorio", null],
    [new DOMException("The operation was aborted due to timeout", "TimeoutError"), "transitorio", null],
    [new DOMException("This operation was aborted", "AbortError"), "transitorio", null],
    [json(401, { error: "invalid_client", error_description: "Client authentication failed" }), "cliente_invalido", 401],
    [json(400, { error: { type: "invalid_client", message: "x" } }), "cliente_invalido", 400],
    // Concessão morta só pelo código (sem caixa): invalid_grant, invalid_token, unauthorized_error.
    [json(400, { error: "invalid_grant", error_description: "Authorization code expired" }), "concessao_invalida", 400],
    [json(403, { error: { type: "UNAUTHORIZED_ERROR", message: "Empresa inativa" } }), "concessao_invalida", 403],
    [json(401, { error: "invalid_token" }), "concessao_invalida", 401],
    [json(401, { error: "INVALID_GRANT" }), "concessao_invalida", 401],
    [json(400, { error: { type: "invalid_token", message: "x" } }), "concessao_invalida", 400],
    [json(403, { error: "unauthorized_error" }), "concessao_invalida", 403],
    // 400/401/403 sem um desses códigos (proxy, WAF, pedido malformado) não mata a concessão.
    [new Response("<html>401</html>", { status: 401 }), "outro", 401],
    [new Response("<html>403 Forbidden</html>", { status: 403 }), "outro", 403],
    [json(400, { error: "invalid_request" }), "outro", 400],
    [json(400, { error: "unsupported_grant_type" }), "outro", 400],
    [json(403, { error: { type: "FORBIDDEN", message: "x" } }), "outro", 403],
    [json(401, {}), "outro", 401],
    [json(404, { error: { type: "RESOURCE_NOT_FOUND" } }), "outro", 404],
    [json(409, {}), "outro", 409],
  ];
  for (const [resposta, tipo, status] of casos) {
    const { fetchImpl } = fetchFalso([resposta]);
    await assert.rejects(
      renovarToken("r", CRED, { fetchImpl }),
      (e: unknown) => e instanceof ErroOAuthBling && e.tipo === tipo && e.status === status,
      `${tipo} ${status}`,
    );
  }
});

test("corpo acima do teto (5 MB): a leitura para e vira transitorio", async () => {
  let lidos = 0;
  const megas = new ReadableStream<Uint8Array>({
    pull(controle) {
      if (lidos === 20) {
        controle.close();
        return;
      }
      lidos += 1;
      controle.enqueue(new Uint8Array(1024 * 1024).fill(0x20));
    },
  });
  const { fetchImpl } = fetchFalso([new Response(megas, { status: 200 })]);
  await assert.rejects(
    renovarToken("r", CRED, { fetchImpl }),
    (e: unknown) => e instanceof ErroOAuthBling && e.tipo === "transitorio" && e.status === null,
  );
  assert.ok(lidos < 10, `leu ${lidos} MB`);
});

test("a mensagem do erro leva o código do Bling e nunca o token, o code ou o segredo", async () => {
  const ecos = [
    json(400, { error: "invalid_grant", error_description: "refresh-secreto-123 de id-do-app:segredo-do-app inválido" }),
    json(400, { error: "refresh-secreto-123" }),
    json(400, { error: { type: "VALIDATION_ERROR", message: "segredo-do-app", description: "refresh-secreto-123" } }),
  ];
  const mensagens: string[] = [];
  for (const resposta of ecos) {
    const { fetchImpl } = fetchFalso([resposta]);
    await assert.rejects(renovarToken("refresh-secreto-123", CRED, { fetchImpl }), (e: unknown) => {
      assert.ok(e instanceof ErroOAuthBling);
      mensagens.push(e.message);
      return true;
    });
  }
  assert.match(mensagens[0], /invalid_grant/);
  assert.match(mensagens[2], /VALIDATION_ERROR/);
  for (const m of mensagens) {
    for (const segredo of ["refresh-secreto-123", "segredo-do-app", "id-do-app"]) assert.ok(!m.includes(segredo), m);
  }
});

test("revogarToken: POST com Basic, token e token_type_hint=refresh_token", async () => {
  const { fetchImpl, chamadas } = fetchFalso([new Response(null, { status: 200 })]);
  await revogarToken("refresh-a-revogar", CRED, { fetchImpl });
  assert.equal(chamadas[0].url, BLING_REVOKE_URL);
  assert.equal(chamadas[0].metodo, "POST");
  assert.equal(chamadas[0].headers.authorization, BASIC);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(chamadas[0].corpo)), { token: "refresh-a-revogar", token_type_hint: "refresh_token" });
});

test("revogarToken nunca lança: recusa ou rede viram aviso no log, sem o token", async (t) => {
  const avisos: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => avisos.push(args.map(String).join(" ")));
  for (const resposta of [json(400, { error: "invalid_token" }), new TypeError("fetch failed"), json(500, {})]) {
    const { fetchImpl } = fetchFalso([resposta]);
    await revogarToken("refresh-a-revogar", CRED, { fetchImpl });
  }
  assert.equal(avisos.length, 3);
  for (const a of avisos) {
    assert.match(a, /^\[bling\/oauth\]/);
    assert.ok(!a.includes("refresh-a-revogar") && !a.includes("segredo-do-app"), a);
  }
});
