import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { urlDoAviso } from "@/lib/yampi/webhooks";
import {
  ALIAS,
  CHAVE_SECRETA,
  CONEXAO_ID,
  ENV,
  TOKEN,
  linhaDaConexao,
  servirYampi,
  type EstadoYampiFalso,
  type RespostaFalsa,
} from "@/test/yampi-falso";

import { DELETE, GET, POST } from "./route";
import { POST as TESTAR } from "./testar/route";

/**
 * As rotas do cartão da Yampi com o dono logado por Bearer contra o PostgREST falso e a Yampi num fetch falso
 * (`src/test/yampi-falso.ts`). O teto de 5/min é um balde em memória que vive o arquivo inteiro: cada teste usa
 * uma loja própria. O de todas as lojas (20/min) também: o arquivo inteiro gasta menos que isso (o teste dele é
 * `lib/yampi/rota.test.ts`).
 */

const CRIADO = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../lib/yampi/__fixtures__/webhook-criado.json"), "utf8")) as unknown;
const ENTRADA = { alias: ALIAS, user_token: TOKEN, user_secret_key: CHAVE_SECRETA };

let papel = "owner";
let loja = "loja-b";
let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
let yampi: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => papel, tenant: () => loja, banco: () => banco, yampi: () => yampi, chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

let sequencia = 0;
beforeEach(() => {
  Object.assign(process.env, ENV);
  papel = "owner";
  sequencia += 1;
  loja = `loja-rota-${sequencia}`;
  banco = {};
  yampi = {};
  estado.chamadas.length = 0;
  estado.chamadasYampi.length = 0;
});

function pedir(metodo: string, corpo?: unknown, caminho = "/api/integracoes/yampi"): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": loja, "content-type": "application/json" },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}
const testar = () => TESTAR(pedir("POST", undefined, "/api/integracoes/yampi/testar"));
const tocouNaYampi = () => estado.chamadas.some((c) => c.url.pathname.startsWith("/rest/v1/yampi_"));
const conectando = () => {
  banco = {
    "POST /rest/v1/yampi_connections": [200, [linhaDaConexao({ status: "aviso_desativado", webhook_id: null, webhook_secret: null }, loja)]],
    "PATCH /rest/v1/yampi_connections": [200, [{ tenant_id: loja }]],
  };
  yampi = { "GET /loja-exemplo/orders": [200, { data: [] }], "GET /loja-exemplo/webhooks": [200, { data: [] }], "POST /loja-exemplo/webhooks": [200, CRIADO] };
};

test("operador e vendedora: 403 em GET, POST, DELETE e testar sem tocar nas tabelas da Yampi", async () => {
  for (const p of ["operator", "seller"]) {
    papel = p;
    for (const r of [await GET(pedir("GET")), await POST(pedir("POST", ENTRADA)), await DELETE(pedir("DELETE")), await testar()]) {
      assert.equal(r.status, 403, p);
    }
  }
  assert.equal(tocouNaYampi(), false);
  assert.equal(estado.chamadasYampi.length, 0);
});

test("GET devolve o cartão sem cache", async () => {
  banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao({}, loja)]] };
  const r = await GET(pedir("GET"));
  assert.deepEqual([r.status, r.headers.get("cache-control")], [200, "no-store"]);
  const cartao = (await r.json()) as { conexao: { token_final: string } };
  assert.equal(cartao.conexao.token_final, TOKEN.slice(-4));
});

test("POST mapeia as falhas: dados_invalidos 400 (a frase cita o navegador), credencial_invalida 400, yampi_fora 502, aviso_nao_criado 502, indisponivel 503", async (t) => {
  t.mock.method(console, "warn", () => {});
  const casos: Array<[string, () => void, unknown, number, RegExp]> = [
    ["dados", () => {}, { ...ENTRADA, user_secret_key: "dono@loja.test.exemplo" }, 400, /navegador pode ter preenchido/],
    ["recusada", () => { yampi = { "GET /loja-exemplo/orders": [401, {}] }; }, ENTRADA, 400, /A Yampi recusou essas credenciais/],
    ["fora", () => { yampi = { "GET /loja-exemplo/orders": [404, {}] }; }, ENTRADA, 502, /A Yampi não respondeu agora/],
    ["aviso", () => { conectando(); yampi = { ...yampi, "POST /loja-exemplo/webhooks": [500, {}] }; }, ENTRADA, 502, /não conseguimos criar o aviso agora/],
    ["indisponivel", () => { delete process.env.INTEGRATIONS_ENCRYPTION_KEY; }, ENTRADA, 503, /^indisponivel$/],
  ];
  for (const [nome, preparar, corpo, status, frase] of casos) {
    loja = `loja-falha-${nome}`;
    Object.assign(process.env, ENV);
    preparar();
    const r = await POST(pedir("POST", corpo));
    assert.equal(r.status, status, nome);
    assert.match(((await r.json()) as { error: string }).error, frase, nome);
  }
});

test("POST com JSON inválido ou campo desconhecido: 400 sem chamar a Yampi", async () => {
  for (const corpo of ["{não é json", { ...ENTRADA, extra: 1 }, [ENTRADA]]) {
    assert.equal((await POST(pedir("POST", corpo))).status, 400, JSON.stringify(corpo));
  }
  assert.equal(estado.chamadasYampi.length, 0);
});

test("POST ok: 200 { ok: true } e nem a resposta nem os logs repetem o token ou a chave", async (t) => {
  const logs = [t.mock.method(console, "warn", () => {}), t.mock.method(console, "error", () => {}), t.mock.method(console, "log", () => {})];
  conectando();
  const r = await POST(pedir("POST", ENTRADA));
  const texto = await r.text();
  assert.deepEqual([r.status, JSON.parse(texto)], [200, { ok: true }]);
  const tudo = [texto, ...logs.flatMap((l) => l.mock.calls.map((c) => c.arguments.join(" ")))].join("\n");
  assert.doesNotMatch(tudo, new RegExp(`${TOKEN}|${CHAVE_SECRETA}`));
});

test("a sexta chamada no minuto, somando Conectar e Testar: 429 sem chamar a Yampi", async () => {
  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  for (let i = 0; i < 3; i += 1) await POST(pedir("POST", { ...ENTRADA, alias: "a" })); // fora do formato: não chama a Yampi
  for (let i = 0; i < 2; i += 1) assert.equal((await testar()).status, 404);
  for (const r of [await POST(pedir("POST", ENTRADA)), await testar()]) {
    assert.deepEqual([r.status, await r.json()], [429, { error: "Muitas tentativas. Aguarde 1 minuto." }]);
  }
  assert.equal(estado.chamadasYampi.length, 0);
});

test("testar devolve o resultado da conferência; sem conexão: 404; sem a chave: 503", async () => {
  banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao({}, loja)]], "PATCH /rest/v1/yampi_connections": [200, [{ tenant_id: loja }]] };
  yampi = { "GET /loja-exemplo/webhooks": [200, { data: [{ id: 5611397, url: urlDoAviso(CONEXAO_ID), active: true }] }] };
  const r = await testar();
  assert.deepEqual([r.status, await r.json()], [200, { credenciais: "ok", aviso: "ativo" }]);

  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  const sem = await testar();
  assert.deepEqual([sem.status, await sem.json()], [404, { error: "Sem conexão com a Yampi." }]);

  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.equal((await testar()).status, 503);
});

test("DELETE: 200 e a Yampi recebe o DELETE do aviso; sem conexão: 404 { error: \"Sem conexão com a Yampi.\" }", async (t) => {
  t.mock.method(console, "warn", () => {});
  banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao({}, loja)]], "PATCH /rest/v1/yampi_connections": [200, []] };
  yampi = { "GET /loja-exemplo/webhooks": [200, { data: [{ id: 5611397, url: urlDoAviso(CONEXAO_ID), active: true }] }], "DELETE /loja-exemplo/webhooks/5611397": [204, null] };
  const r = await DELETE(pedir("DELETE"));
  assert.deepEqual([r.status, await r.json()], [200, { ok: true, aviso_apagado: true }]);
  assert.ok(estado.chamadasYampi.some((c) => c.metodo === "DELETE"));
  const patch = estado.chamadas.find((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections");
  assert.equal(patch?.url.searchParams.get("tenant_id"), `eq.${loja}`);

  // A Yampi fora: desconectada mesmo assim, e a tela fica sabendo que o aviso ficou lá.
  yampi = { "GET /loja-exemplo/webhooks": [404, {}] };
  const ficou = await DELETE(pedir("DELETE"));
  assert.deepEqual([ficou.status, await ficou.json()], [200, { ok: true, aviso_apagado: false }]);

  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  const sem = await DELETE(pedir("DELETE"));
  assert.deepEqual([sem.status, await sem.json()], [404, { error: "Sem conexão com a Yampi." }]);
});
