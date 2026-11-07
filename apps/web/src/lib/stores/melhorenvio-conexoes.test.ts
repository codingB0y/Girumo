import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import {
  apagarConexao,
  concluirPassada,
  contextoDoTokenMe,
  lerConexao,
  marcarReautorizar,
  reivindicarPassada,
  salvarConexao,
  trocarTokens,
} from "./melhorenvio-conexoes";
import { consumirEstadoOAuthMe, cookieDoEstadoMe, criarEstadoOAuthMe } from "./melhorenvio-oauth-states";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de `bling-conexoes.test.ts`). */

type Chamada = { metodo: string; url: URL; prefer: string; corpo: unknown };
const chamadas: Chamada[] = [];
let respostas: Array<{ status: number; body: unknown }> = [];

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    chamadas.push({
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: bruto ? JSON.parse(bruto) : null,
    });
    const proxima = respostas.shift() ?? { status: 200, body: [] };
    res.setHeader("Content-Type", "application/json");
    res.statusCode = proxima.status;
    res.end(proxima.body === null ? undefined : JSON.stringify(proxima.body));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => {
  postgrest.close();
});
beforeEach(() => {
  chamadas.length = 0;
  respostas = [];
});

const preparar = (...lista: Array<[number, unknown]>) => {
  respostas = lista.map(([status, body]) => ({ status, body }));
};
const filtros = (i: number) => Object.fromEntries([...chamadas[i].url.searchParams].filter(([k]) => k !== "select"));
const corpo = (i: number) => chamadas[i].corpo as Record<string, unknown>;

const LINHA = {
  tenant_id: "loja-a",
  status: "ativa",
  access_token_enc: "acc-enc",
  refresh_token_enc: "ref-enc",
  expires_at: "2026-12-01T00:00:00+00:00",
  refresh_expires_at: "2026-12-16T00:00:00+00:00",
  account_name: "Loja da Ana",
  account_email: "ana@exemplo.com",
  has_labels: true,
  first_pass_at: null,
  last_check_at: "2026-11-02T14:00:00+00:00",
  last_error: null,
};
const CONEXAO = {
  tenantId: "loja-a",
  status: "ativa",
  accessTokenEnc: "acc-enc",
  refreshTokenEnc: "ref-enc",
  expiraEm: "2026-12-01T00:00:00+00:00",
  renovacaoExpiraEm: "2026-12-16T00:00:00+00:00",
  contaNome: "Loja da Ana",
  contaEmail: "ana@exemplo.com",
  temEtiqueta: true,
  primeiraPassadaEm: null,
  ultimaConsultaEm: "2026-11-02T14:00:00+00:00",
  ultimoErro: null,
};
const NOVO = {
  accessTokenEnc: "acc-novo",
  refreshTokenEnc: "ref-novo",
  expiraEm: new Date("2026-12-10T00:00:00.000Z"),
  renovacaoExpiraEm: new Date("2026-12-25T00:00:00.000Z"),
};

test("contextoDoTokenMe separa loja e campo", () => {
  assert.equal(contextoDoTokenMe("loja-a", "access"), "melhorenvio:loja-a:access");
  assert.equal(contextoDoTokenMe("loja-a", "refresh"), "melhorenvio:loja-a:refresh");
});

test("lerConexao filtra a loja e mapeia a linha", async () => {
  preparar([200, [LINHA]]);
  assert.deepEqual(await lerConexao("loja-a"), CONEXAO);
  assert.equal(filtros(0).tenant_id, "eq.loja-a");
  preparar([200, []]);
  assert.equal(await lerConexao("loja-a"), null);
});

test("salvarConexao faz upsert e zera a passada", async () => {
  preparar([201, []]);
  await salvarConexao("loja-a", {
    ...NOVO,
    contaNome: "Loja da Ana",
    contaEmail: "ana@exemplo.com",
    temEtiqueta: true,
    conectadaPor: "user-1",
  });
  const [{ metodo, url, prefer }] = chamadas;
  assert.equal(metodo, "POST");
  assert.equal(url.pathname, "/rest/v1/melhorenvio_connections");
  assert.equal(url.searchParams.get("on_conflict"), "tenant_id");
  assert.match(prefer, /resolution=merge-duplicates/);
  const c = corpo(0);
  assert.equal(c.tenant_id, "loja-a");
  assert.equal(c.status, "ativa");
  assert.equal(c.first_pass_at, null);
  assert.equal(c.last_check_at, null);
  assert.equal(c.last_error, null);
  assert.equal(c.has_labels, true);
  assert.equal(c.account_name, "Loja da Ana");
  assert.equal(c.account_email, "ana@exemplo.com");
  assert.equal(c.connected_by, "user-1");
  assert.equal(c.access_token_enc, "acc-novo");
  assert.equal(c.expires_at, "2026-12-10T00:00:00.000Z");
  assert.equal(c.refresh_expires_at, "2026-12-25T00:00:00.000Z");
});

test("reivindicarPassada só pega loja ativa e fora da vez", async () => {
  preparar([200, []]);
  const agora = new Date("2026-11-02T15:00:00.000Z");
  assert.equal(await reivindicarPassada("loja-a", agora, 30 * 60_000), null);
  assert.equal(chamadas[0].metodo, "PATCH");
  assert.deepEqual(filtros(0), {
    tenant_id: "eq.loja-a",
    status: "eq.ativa",
    or: "(last_check_at.is.null,last_check_at.lt.2026-11-02T14:30:00.000Z)",
  });
  assert.equal(corpo(0).last_check_at, "2026-11-02T15:00:00.000Z");

  preparar([200, [LINHA]]);
  assert.deepEqual(await reivindicarPassada("loja-a", agora, 30 * 60_000), CONEXAO);
});

test("trocarTokens é condicional ao refresh lido (Review Focus 5)", async () => {
  preparar([200, []]);
  assert.equal(await trocarTokens("loja-a", "ref-lido", NOVO), false);
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", refresh_token_enc: "eq.ref-lido" });
  assert.equal(corpo(0).refresh_token_enc, "ref-novo");
  preparar([200, [{ tenant_id: "loja-a" }]]);
  assert.equal(await trocarTokens("loja-a", "ref-lido", NOVO), true);
});

test("marcarReautorizar só na transição e só muda a conexão ativa", async () => {
  preparar([200, []]);
  assert.equal(await marcarReautorizar("loja-a", "concessao_invalida"), false);
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", status: "eq.ativa" });
  assert.deepEqual(corpo(0), { status: "reautorizar", last_error: "concessao_invalida" });
  preparar([200, [{ tenant_id: "loja-a" }]]);
  assert.equal(await marcarReautorizar("loja-a", "concessao_invalida"), true);
});

test("concluirPassada: primeira passada sem erro grava first_pass_at", async () => {
  preparar([200, []]);
  const agora = new Date("2026-11-02T15:00:00.000Z");
  await concluirPassada("loja-a", { agora, primeiraPassada: true, temEtiqueta: false, erro: null });
  assert.equal(filtros(0).tenant_id, "eq.loja-a");
  assert.deepEqual(corpo(0), { last_error: null, first_pass_at: agora.toISOString(), has_labels: false });
});

test("concluirPassada: com erro não grava first_pass_at; null não manda has_labels", async () => {
  preparar([200, []]);
  const agora = new Date("2026-11-02T15:00:00.000Z");
  await concluirPassada("loja-a", { agora, primeiraPassada: true, temEtiqueta: null, erro: "http_500" });
  assert.deepEqual(corpo(0), { last_error: "http_500" });
});

test("apagarConexao filtra a loja", async () => {
  preparar([204, null]);
  await apagarConexao("loja-a");
  assert.equal(chamadas[0].metodo, "DELETE");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a" });
});

test("erro do Supabase vira exceção", async () => {
  preparar([500, { message: "quebrou" }]);
  await assert.rejects(() => lerConexao("loja-a"), /quebrou/);
});

test("state de uso único: consumir apaga por hash dentro da validade", async () => {
  preparar([200, []]);
  const agora = new Date("2026-11-02T15:00:00.000Z");
  assert.equal(await consumirEstadoOAuthMe("h1", agora), null);
  assert.equal(chamadas[0].metodo, "DELETE");
  assert.equal(chamadas[0].url.pathname, "/rest/v1/melhorenvio_oauth_states");
  assert.deepEqual(filtros(0), { state_hash: "eq.h1", expires_at: "gt.2026-11-02T15:00:00.000Z" });
  assert.equal(chamadas[0].url.searchParams.get("select"), "tenant_id,user_id");
  preparar([200, [{ tenant_id: "loja-a", user_id: "user-1" }]]);
  assert.deepEqual(await consumirEstadoOAuthMe("h1", agora), { tenantId: "loja-a", userId: "user-1" });
});

test("criarEstadoOAuthMe faz a faxina da loja e insere", async () => {
  preparar([204, null], [201, []]);
  await criarEstadoOAuthMe({ stateHash: "h1", tenantId: "loja-a", userId: "user-1", expiraEm: new Date("2026-11-02T15:10:00.000Z") });
  assert.equal(chamadas[0].metodo, "DELETE");
  assert.equal(filtros(0).tenant_id, "eq.loja-a");
  assert.match(filtros(0).expires_at, /^lte\./);
  assert.equal(chamadas[1].metodo, "POST");
  assert.deepEqual(corpo(1), { state_hash: "h1", tenant_id: "loja-a", user_id: "user-1", expires_at: "2026-11-02T15:10:00.000Z" });
});

test("cookie do state", () => {
  assert.equal(
    cookieDoEstadoMe("abc", 600),
    "melhorenvio_oauth_state=abc; Path=/api/integracoes/melhor-envio; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
  );
});