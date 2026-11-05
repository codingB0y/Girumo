import assert from "node:assert/strict";
import { test } from "node:test";

import {
  credenciaisMelhorEnvio,
  ErroOAuthMelhorEnvio,
  ME_AUTHORIZE_URL,
  ME_TOKEN_URL,
  renovarToken,
  trocarCodigo,
  urlDeAutorizacao,
  USER_AGENT_ME,
  type TipoErroOAuthMe,
} from "./oauth";

const CRED = { clientId: "1234567", clientSecret: "segredo-do-app" };
const AGORA = Date.UTC(2026, 9, 13, 12, 0, 0);
const TOKEN_OK = { token_type: "Bearer", expires_in: 2592000, access_token: "acc-1", refresh_token: "ref-1" };
const RETORNO = "https://www.girumo.com.br/api/integracoes/melhor-envio/retorno";

type Chamada = { url: string; metodo: string; headers: Record<string, string>; corpo: string; redirect: unknown };

function fetchFalso(respostas: Array<Response | Error>) {
  const chamadas: Chamada[] = [];
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(entrada),
      metodo: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      corpo: String(init?.body ?? ""),
      redirect: init?.redirect,
    });
    const r = respostas.shift();
    if (r === undefined) throw new Error("fetch falso: acabaram as respostas");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

test("credenciaisMelhorEnvio exige as duas e aplica trim", () => {
  assert.deepEqual(credenciaisMelhorEnvio({ MELHOR_ENVIO_CLIENT_ID: " 1\n", MELHOR_ENVIO_CLIENT_SECRET: "s " } as unknown as NodeJS.ProcessEnv), {
    clientId: "1",
    clientSecret: "s",
  });
  assert.equal(credenciaisMelhorEnvio({ MELHOR_ENVIO_CLIENT_ID: "1" } as unknown as NodeJS.ProcessEnv), null);
});

test("URL de autorização", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const u = new URL(urlDeAutorizacao("1234567", "st"));
  assert.equal(u.origin + u.pathname, ME_AUTHORIZE_URL);
  assert.equal(u.searchParams.get("client_id"), "1234567");
  assert.equal(u.searchParams.get("redirect_uri"), RETORNO);
  assert.equal(u.searchParams.get("scope"), "orders-read shipping-tracking users-read");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("state"), "st");
});

test("troca do code", async () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const { fetchImpl, chamadas } = fetchFalso([json(TOKEN_OK)]);
  const t = await trocarCodigo("code-9", CRED, { fetchImpl, agora: () => AGORA });
  assert.equal(chamadas.length, 1);
  const c = chamadas[0];
  assert.equal(c.url, ME_TOKEN_URL);
  assert.equal(c.metodo, "POST");
  assert.match(c.headers["content-type"], /application\/x-www-form-urlencoded/);
  assert.equal(c.headers["user-agent"], USER_AGENT_ME);
  assert.equal(c.redirect, "error");
  const p = new URLSearchParams(c.corpo);
  assert.equal(p.get("grant_type"), "authorization_code");
  assert.equal(p.get("client_id"), CRED.clientId);
  assert.equal(p.get("client_secret"), CRED.clientSecret);
  assert.equal(p.get("redirect_uri"), RETORNO);
  assert.equal(p.get("code"), "code-9");
  assert.equal(t.accessToken, "acc-1");
  assert.equal(t.refreshToken, "ref-1");
  assert.equal(t.expiraEm.getTime(), AGORA + 2592000 * 1000);
  assert.equal(t.renovacaoExpiraEm.getTime(), AGORA + 45 * 24 * 3600 * 1000);
});

test("renovação", async () => {
  const { fetchImpl, chamadas } = fetchFalso([json(TOKEN_OK)]);
  await renovarToken("ref-0", CRED, { fetchImpl, agora: () => AGORA });
  const p = new URLSearchParams(chamadas[0].corpo);
  assert.equal(p.get("grant_type"), "refresh_token");
  assert.equal(p.get("refresh_token"), "ref-0");
  assert.equal(p.get("client_id"), CRED.clientId);
  assert.equal(p.get("client_secret"), CRED.clientSecret);
});

const CASOS: Array<[string, () => Response | Error, TipoErroOAuthMe]> = [
  ["400 invalid_grant", () => json({ error: "invalid_grant" }, 400), "concessao_invalida"],
  ["401 invalid_request", () => json({ error: "invalid_request" }, 401), "concessao_invalida"],
  ["400 invalid_request", () => json({ error: "invalid_request" }, 400), "outro"],
  ["401 invalid_client", () => json({ error: "invalid_client" }, 401), "cliente_invalido"],
  ["429", () => json({}, 429), "limite"],
  ["503", () => json({}, 503), "transitorio"],
  ["fetch lançando", () => new Error("falhou com client_secret=segredo-do-app ref-0 code-9"), "transitorio"],
  ["200 sem refresh_token", () => json({ expires_in: 100, access_token: "a" }), "outro"],
  ["200 com expires_in > 60 dias", () => json({ ...TOKEN_OK, expires_in: 61 * 24 * 3600 }), "outro"],
];

for (const [nome, resposta, tipo] of CASOS) {
  test(`erro: ${nome} → ${tipo}, sem segredo na mensagem`, async () => {
    const { fetchImpl } = fetchFalso([resposta()]);
    await assert.rejects(trocarCodigo("code-9", CRED, { fetchImpl, agora: () => AGORA }), (e: unknown) => {
      assert.ok(e instanceof ErroOAuthMelhorEnvio);
      assert.equal(e.tipo, tipo);
      for (const s of ["segredo-do-app", "ref-0", "code-9"]) assert.ok(!e.message.includes(s));
      return true;
    });
  });
}
