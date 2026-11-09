import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { abrir } from "@/lib/security/secret-box";
import {
  ALIAS,
  CHAVE,
  CHAVE_SECRETA,
  CONEXAO_ID,
  ENV,
  TENANT,
  TOKEN,
  linhaDaConexao,
  servirYampi,
  type EstadoYampiFalso,
  type RespostaFalsa,
} from "@/test/yampi-falso";

import { AVISO_NAO_CRIADO, conectarYampi, desconectarYampi } from "./conectar";
import { contextoDoSegredo } from "./credenciais";
import { urlDoAviso } from "./webhooks";

const CRIADO = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "webhook-criado.json"), "utf8")) as unknown;
const ENTRADA = { alias: ALIAS, user_token: TOKEN, user_secret_key: CHAVE_SECRETA };

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
let yampi: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => yampi, chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

/** A linha que o upsert devolve: credencial nova, aviso por criar. */
const recemGravada = () => linhaDaConexao({ status: "aviso_desativado", webhook_id: null, webhook_secret: null });

let gravadaNoBanco = recemGravada();

beforeEach(() => {
  Object.assign(process.env, ENV);
  gravadaNoBanco = recemGravada();
  banco = {
    "POST /rest/v1/yampi_connections": [200, [gravadaNoBanco]],
    "PATCH /rest/v1/yampi_connections": [200, [{ tenant_id: TENANT }]],
  };
  yampi = {
    "GET /loja-exemplo/orders": [200, { data: [] }],
    "GET /loja-exemplo/webhooks": [200, { data: [] }],
    "POST /loja-exemplo/webhooks": [200, CRIADO],
  };
  estado.chamadas.length = 0;
  estado.chamadasYampi.length = 0;
  estado.linhaDoTempo.length = 0;
});

const naConexao = (metodo: string) => estado.chamadas.filter((c) => c.metodo === metodo && c.url.pathname === "/rest/v1/yampi_connections");

test("conecta: testa a credencial, grava selada, cria o aviso e fica ativa — nessa ordem", async () => {
  assert.deepEqual(await conectarYampi(TENANT, ENTRADA), { ok: true });
  assert.deepEqual(estado.linhaDoTempo, [
    "yampi GET /loja-exemplo/orders",
    "db POST yampi_connections",
    "yampi GET /loja-exemplo/webhooks",
    "yampi POST /loja-exemplo/webhooks",
    "db PATCH yampi_connections",
  ]);
  assert.equal(estado.chamadasYampi[0].consulta.get("limit"), "1");
  const [upsert] = naConexao("POST");
  const gravado = upsert.corpo as Record<string, string>;
  assert.equal(upsert.url.searchParams.get("on_conflict"), "tenant_id");
  assert.deepEqual([gravado.tenant_id, gravado.alias, gravado.status], [TENANT, ALIAS, "aviso_desativado"]);
  assert.notEqual(gravado.user_token, TOKEN); // selado
  assert.equal(abrir(gravado.user_token, contextoDoSegredo(TENANT, "user_token"), CHAVE), TOKEN);
  assert.equal(abrir(gravado.user_secret_key, contextoDoSegredo(TENANT, "user_secret_key"), CHAVE), CHAVE_SECRETA);
  assert.equal((naConexao("PATCH")[0].corpo as Record<string, unknown>).status, "ativa");
});

test("credencial recusada pela Yampi (401): credencial_invalida e nada é gravado", async () => {
  yampi = { "GET /loja-exemplo/orders": [401, { message: "Unauthenticated." }] };
  assert.deepEqual(await conectarYampi(TENANT, ENTRADA), { ok: false, falha: "credencial_invalida" });
  assert.equal(estado.chamadas.length, 0);
});

test("dados fora do formato (e-mail no lugar da chave, alias com barra, texto curto, campo faltando): dados_invalidos sem chamar a Yampi nem o banco", async () => {
  for (const entrada of [
    { ...ENTRADA, user_secret_key: "dono@loja.test.exemplo" },
    { ...ENTRADA, alias: "loja/../outra" },
    { ...ENTRADA, user_token: "curto" },
    { alias: ALIAS, user_token: TOKEN },
    null,
    "texto",
  ]) {
    assert.deepEqual(await conectarYampi(TENANT, entrada), { ok: false, falha: "dados_invalidos" }, JSON.stringify(entrada));
  }
  assert.deepEqual([estado.chamadas.length, estado.chamadasYampi.length], [0, 0]);
});

test("Yampi fora no teste da credencial: yampi_fora e nada é gravado", async () => {
  for (const falha of [[503, {}], [404, {}]] as RespostaFalsa[]) {
    yampi = { "GET /loja-exemplo/orders": falha };
    assert.deepEqual(await conectarYampi(TENANT, ENTRADA), { ok: false, falha: "yampi_fora" });
  }
  assert.equal(estado.chamadas.length, 0);
});

test("aviso não criado: as credenciais ficam gravadas com aviso_desativado, last_error escrito, e a falha é aviso_nao_criado", async (t) => {
  t.mock.method(console, "warn", () => {});
  yampi = { ...yampi, "POST /loja-exemplo/webhooks": [500, { message: "fora" }] };
  assert.deepEqual(await conectarYampi(TENANT, ENTRADA), { ok: false, falha: "aviso_nao_criado" });
  assert.equal((naConexao("POST")[0].corpo as Record<string, unknown>).status, "aviso_desativado");
  const [patch] = naConexao("PATCH");
  assert.deepEqual(patch.corpo, { last_error: AVISO_NAO_CRIADO });
  // Só na conexão que acabou de ser gravada: se a loja desconectou no meio, o erro não volta para a linha.
  assert.equal(patch.url.searchParams.get("user_token"), `eq.${gravadaNoBanco.user_token as string}`);
  assert.equal(estado.chamadasYampi.filter((c) => c.metodo === "POST").length, 1, "o POST não repete");
});

test("desconectar: o banco primeiro, depois apaga o aviso na Yampi com as credenciais de antes; a Yampi fora não impede; sem conexão devolve false", async (t) => {
  t.mock.method(console, "warn", () => {});
  const nosso = { data: [{ id: 5611397, url: urlDoAviso(CONEXAO_ID), active: true }, { id: 9, url: "https://outro.exemplo/x", active: true }] };
  banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao()]], "PATCH /rest/v1/yampi_connections": [200, []] };
  yampi = { "GET /loja-exemplo/webhooks": [200, nosso], "DELETE /loja-exemplo/webhooks/5611397": [204, null] };
  assert.equal(await desconectarYampi(TENANT), true);
  assert.deepEqual(estado.linhaDoTempo.slice(0, 2), ["db GET yampi_connections", "db PATCH yampi_connections"]); // banco antes da Yampi
  assert.deepEqual(estado.chamadasYampi.filter((c) => c.metodo === "DELETE").map((c) => c.caminho), ["/loja-exemplo/webhooks/5611397"]);
  assert.equal(estado.chamadasYampi[0].cabecalhos["user-token"], TOKEN);

  yampi = { "GET /loja-exemplo/webhooks": [404, {}] };
  assert.equal(await desconectarYampi(TENANT), true, "a Yampi fora não desfaz a desconexão");

  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  assert.equal(await desconectarYampi(TENANT), false);
  banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao({ status: "desconectada", user_token: null, user_secret_key: null })]], "PATCH /rest/v1/yampi_connections": [200, []] };
  assert.equal(await desconectarYampi(TENANT), false, "já desconectada conta como sem conexão");
});
