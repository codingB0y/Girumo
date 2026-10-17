import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

/**
 * A rota de verdade — getTenantContext, supabase-js, revogação — contra um
 * Supabase falso em 127.0.0.1 (molde de `api/members/members.test.ts`). O falso
 * responde Auth e PostgREST e registra cada chamada: é isso que prova que a
 * troca de e-mail/senha só acontece depois da senha atual conferida, e nunca
 * pela API de admin.
 */

type Rota = typeof import("./route");
type Chamada = { metodo: string; caminho: string; url: URL; corpo: Record<string, unknown> | undefined; bearer: string };

const LOJA = "11111111-1111-4111-8111-111111111111";
const DONO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMAIL = "dono@loja.test";
const SENHA_ATUAL = "senha-atual-123";

const chamadas: Chamada[] = [];
let identidades: Array<{ provider: string }> = [];
let falhaDoToken: { status: number; code: string } | null = null;
let falhaDoUpdate: { status: number; code: string } | null = null;
let rota: Rota;
let auth: typeof import("@/lib/auth");
let revogacao: typeof import("@/lib/auth/session-revocation");

function lerCorpo(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  return new Promise((pronto) => {
    let bruto = "";
    req.on("data", (pedaco) => (bruto += pedaco));
    req.on("end", () => pronto(bruto ? JSON.parse(bruto) : undefined));
  });
}

function usuario(extra: Record<string, unknown> = {}) {
  return {
    id: DONO,
    aud: "authenticated",
    email: EMAIL,
    app_metadata: {},
    user_metadata: {},
    identities: identidades,
    created_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const supabase = createServer((req, res) => {
  const responde = (status: number, dados?: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(dados === undefined ? "" : JSON.stringify(dados));
  };
  // Exceção no falso vira 500 visível — sem isto o fetch do supabase-js fica
  // esperando a resposta para sempre e o arquivo de teste trava sem dizer nada.
  atender(req, responde).catch((erro: unknown) => responde(500, { message: String(erro) }));
});

async function atender(req: IncomingMessage, responde: (status: number, dados?: unknown) => void) {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  const metodo = req.method ?? "GET";
  const corpo = await lerCorpo(req);
  const bearer = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
  chamadas.push({ metodo, caminho: url.pathname, url, corpo, bearer });
  const erro = (falha: { status: number; code: string }) =>
    responde(falha.status, { code: falha.status, error_code: falha.code, msg: `falha ${falha.code}` });

  if (url.pathname === "/auth/v1/user" && metodo === "GET") return responde(200, usuario());
  if (url.pathname === `/auth/v1/admin/users/${DONO}`) return responde(200, usuario());
  if (url.pathname === "/auth/v1/token") {
    if (falhaDoToken) return erro(falhaDoToken);
    if (corpo?.email !== EMAIL || corpo?.password !== SENHA_ATUAL) {
      return erro({ status: 400, code: "invalid_credentials" });
    }
    return responde(200, {
      access_token: "token-descartavel",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "refresh-descartavel",
      user: usuario(),
    });
  }
  if (url.pathname === "/auth/v1/user" && metodo === "PUT") {
    if (falhaDoUpdate) return erro(falhaDoUpdate);
    // Troca de e-mail segura: o endereço novo fica pendente até o link ser clicado.
    return responde(200, usuario(corpo?.email ? { new_email: corpo.email } : {}));
  }
  if (url.pathname === "/auth/v1/logout") return responde(204);
  if (url.pathname === "/rest/v1/memberships") return responde(200, [{ tenant_id: LOJA, role: "owner", modules: [] }]);
  if (url.pathname === "/rest/v1/users") {
    return metodo === "GET" ? responde(200, [{ name: "Dono", email: EMAIL }]) : responde(204);
  }
  if (url.pathname === "/rest/v1/session_revocations") return responde(201);
  responde(500, { message: `inesperado: ${metodo} ${url.pathname}` });
}

function pedido(metodo: string, corpo?: unknown): Request {
  return new Request("http://localhost/api/auth/account", {
    method: metodo,
    headers: { authorization: "Bearer token-do-dono", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

const em = (caminho: string, metodo?: string) =>
  chamadas.filter((c) => c.caminho === caminho && (!metodo || c.metodo === metodo));

/** Nenhuma credencial mudou: nem pelo fluxo do usuário, nem pela API de admin. */
function nadaMudouNoAuth() {
  assert.deepEqual(em("/auth/v1/user", "PUT"), []);
  assert.deepEqual(chamadas.filter((c) => c.caminho.startsWith("/auth/v1/admin/") && c.metodo !== "GET"), []);
  assert.deepEqual(em("/rest/v1/session_revocations"), []);
}

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-do-falso";
  process.env.SUPABASE_ANON_KEY = "anon-do-falso";
  process.env.AUTH_SECRET ??= "segredo-do-teste";
  rota = await import("./route");
  auth = await import("@/lib/auth");
  revogacao = await import("@/lib/auth/session-revocation");
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
  identidades = [{ provider: "email" }];
  falhaDoToken = null;
  falhaDoUpdate = null;
});

test("GET: diz se a conta entra só pelo Google — essa conta não tem senha atual para informar", async () => {
  const comSenha = (await (await rota.GET(pedido("GET"))).json()) as Record<string, unknown>;
  assert.equal(comSenha.soGoogle, false);
  assert.equal(comSenha.name, "Dono");
  // `users` tem tenant_id: a leitura do nome fica na loja da sessão.
  assert.equal(em("/rest/v1/users", "GET")[0].url.searchParams.get("tenant_id"), `eq.${LOJA}`);

  identidades = [{ provider: "google" }];
  const google = (await (await rota.GET(pedido("GET"))).json()) as Record<string, unknown>;
  assert.equal(google.soGoogle, true);

  identidades = [{ provider: "google" }, { provider: "email" }];
  const ambos = (await (await rota.GET(pedido("GET"))).json()) as Record<string, unknown>;
  assert.equal(ambos.soGoogle, false);
});

test("PATCH e-mail ou senha sem a senha atual: 400 e nada muda no Auth", async () => {
  for (const corpo of [{ email: "novo@loja.test" }, { password: "senha-nova-456" }]) {
    const res = await rota.PATCH(pedido("PATCH", corpo));
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /senha atual/i);
  }
  assert.deepEqual(em("/auth/v1/token"), []);
  nadaMudouNoAuth();
});

test("PATCH com a senha atual errada: 403 'Senha atual incorreta.' e nada muda", async () => {
  const res = await rota.PATCH(pedido("PATCH", { email: "novo@loja.test", currentPassword: "chute" }));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Senha atual incorreta." });
  // A senha é conferida contra o e-mail DA SESSÃO, não um e-mail vindo do corpo.
  assert.equal(em("/auth/v1/token")[0].corpo?.email, EMAIL);
  nadaMudouNoAuth();
});

test("PATCH em conta só-Google sem senha: o erro aponta 'Esqueci a senha'", async () => {
  identidades = [{ provider: "google" }];
  const res = await rota.PATCH(pedido("PATCH", { password: "senha-nova-456", currentPassword: "qualquer" }));
  assert.equal(res.status, 403);
  assert.match(((await res.json()) as { error: string }).error, /Google.*Esqueci a senha/);
  nadaMudouNoAuth();
});

test("PATCH barrado pelo limite do Supabase ao conferir a senha: 429, não 'senha incorreta'", async () => {
  falhaDoToken = { status: 429, code: "over_request_rate_limit" };
  const res = await rota.PATCH(pedido("PATCH", { password: "senha-nova-456", currentPassword: SENHA_ATUAL }));
  assert.equal(res.status, 429);
  assert.match(((await res.json()) as { error: string }).error, /Muitas tentativas/);
  nadaMudouNoAuth();
});

test("PATCH e-mail com a senha certa: troca pelo fluxo com confirmação, nunca pela API de admin", async () => {
  const res = await rota.PATCH(pedido("PATCH", { email: " Novo@Loja.test ", currentPassword: SENHA_ATUAL }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, emailPendente: true });

  const [troca] = em("/auth/v1/user", "PUT");
  // (o supabase-js junta `code_challenge` nulo ao corpo; o que importa são as credenciais)
  assert.equal(troca.corpo?.email, "novo@loja.test");
  assert.equal(troca.corpo?.password, undefined);
  assert.equal(troca.bearer, "token-descartavel");
  assert.deepEqual(chamadas.filter((c) => c.caminho.startsWith("/auth/v1/admin/") && c.metodo !== "GET"), []);
  // Trocar e-mail não derruba ninguém, mas a sessão aberta só para conferir a senha é encerrada
  // — só ela (`local`): `global` derrubaria também a sessão deste aparelho.
  assert.deepEqual(em("/rest/v1/session_revocations"), []);
  const [saida] = em("/auth/v1/logout");
  assert.equal(saida?.bearer, "token-descartavel");
  assert.equal(saida?.url.searchParams.get("scope"), "local");
  assert.equal(res.headers.get("set-cookie"), null);
});

test("PATCH senha com a senha certa: troca, derruba as outras sessões e mantém este aparelho", async () => {
  const res = await rota.PATCH(pedido("PATCH", { password: "senha-nova-456", currentPassword: SENHA_ATUAL }));
  assert.equal(res.status, 200);

  const [troca] = em("/auth/v1/user", "PUT");
  assert.equal(troca.corpo?.password, "senha-nova-456");
  assert.equal(troca.bearer, "token-descartavel");
  // Sessões do Supabase: logout global a partir da sessão descartável.
  assert.equal(em("/auth/v1/logout")[0].url.searchParams.get("scope"), "global");
  // Cookie dz_session: corte em session_revocations para este usuário…
  const [corte] = em("/rest/v1/session_revocations", "POST");
  assert.equal(corte.corpo?.auth_user_id, DONO);
  // …e um cookie novo para este aparelho, emitido depois do corte (não cai junto).
  const cookie = /dz_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
  const claims = await auth.parseSession(cookie ? decodeURIComponent(cookie) : null);
  assert.equal(claims?.authUserId, DONO);
  assert.equal(revogacao.isSessionRevoked(claims!.issuedAt, String(corte.corpo?.revoked_before)), false);
  // Um cookie emitido 1 minuto antes da troca cai.
  assert.equal(revogacao.isSessionRevoked(claims!.issuedAt - 60_000, String(corte.corpo?.revoked_before)), true);
});

test("PATCH senha igual à atual: mensagem em português e ninguém é desconectado", async () => {
  falhaDoUpdate = { status: 422, code: "same_password" };
  const res = await rota.PATCH(pedido("PATCH", { password: SENHA_ATUAL, currentPassword: SENHA_ATUAL }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "A senha nova precisa ser diferente da atual." });
  assert.deepEqual(em("/rest/v1/session_revocations"), []);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("PATCH nome continua sem senha atual e fica na loja da sessão", async () => {
  const res = await rota.PATCH(pedido("PATCH", { name: "  Dona Ana  " }));
  assert.equal(res.status, 200);
  assert.deepEqual(em("/auth/v1/token"), []);
  const [escrita] = em("/rest/v1/users", "PATCH");
  assert.deepEqual(escrita.corpo, { name: "Dona Ana" });
  assert.equal(escrita.url.searchParams.get("auth_user_id"), `eq.${DONO}`);
  assert.equal(escrita.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});
