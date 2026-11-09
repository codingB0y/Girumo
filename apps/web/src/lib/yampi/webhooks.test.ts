import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { abrir } from "@/lib/security/secret-box";
import { CHAVE, CONEXAO_ID, ENV, TENANT, linhaDaConexao, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { contextoDoSegredo } from "./credenciais";
import { EVENTOS_YAMPI, type ConexaoYampi } from "./tipos";
import { estadoDoAviso, listarAvisosDaYampi, recriarAviso, urlDoAviso } from "./webhooks";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const fixture = (nome: string) => JSON.parse(readFileSync(join(FIXTURES, nome), "utf8")) as { data: Record<string, unknown> | Array<Record<string, unknown>> };
const CRIADO = fixture("webhook-criado.json");
const LISTA = fixture("webhooks-lista.json");
const ID_DA_FIXTURE = (CRIADO.data as { id: number }).id;
const SECRET_KEY_DA_FIXTURE = (CRIADO.data as { secret_key: string }).secret_key;

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
let yampi: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => yampi, chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

beforeEach(() => {
  Object.assign(process.env, ENV);
  banco = { "PATCH /rest/v1/yampi_connections": [200, []] };
  yampi = {};
  estado.chamadas.length = 0;
  estado.chamadasYampi.length = 0;
});

function conexao(over: Partial<ConexaoYampi> = {}): ConexaoYampi {
  const l = linhaDaConexao();
  return {
    id: CONEXAO_ID, tenantId: TENANT, alias: "loja-exemplo", status: "ativa",
    userTokenSelado: l.user_token as string, userSecretKeySelado: l.user_secret_key as string,
    webhookId: "5611397", webhookSecretSelado: l.webhook_secret as string, lastEventAt: null, lastCheckAt: null, lastError: null, ...over,
  };
}

const metodos = (m: string) => estado.chamadasYampi.filter((c) => c.metodo === m);

test("estadoDoAviso: ativo, desativado (active:false e disabled_at) e ausente (id fora da lista), ignorando avisos de outra URL", () => {
  const lista = [{ id: "7", url: urlDoAviso(CONEXAO_ID), ativo: true }, { id: "8", url: "https://outro.exemplo/x", ativo: true }];
  assert.equal(estadoDoAviso(lista, { webhookId: "7" }), "ativo");
  assert.equal(estadoDoAviso([{ ...lista[0], ativo: false }], { webhookId: "7" }), "desativado");
  assert.equal(estadoDoAviso(lista, { webhookId: "9" }), "ausente");
  assert.equal(estadoDoAviso(lista, { webhookId: null }), "ausente");
});

test("listarAvisosDaYampi lê data[] e traduz active/disabled_at em ativo", async () => {
  // A fixture da Fase 0 tem o ativo; o desativado é o da doc (a Yampi não desativa por API, Y20).
  const desligados = [
    { id: 8, url: "https://x.exemplo/a", active: false, disabled_at: null },
    { id: 9, url: "https://x.exemplo/b", active: true, disabled_at: "2026-11-01 10:00:00" },
  ];
  yampi = { "GET /loja-exemplo/webhooks": [200, { ...LISTA, data: [...(LISTA.data as unknown[]), ...desligados, { sem: "id" }] }] };
  const lista = await listarAvisosDaYampi(conexao());
  assert.deepEqual(lista.map((a) => [a.id, a.ativo]), [["5611397", true], ["8", false], ["9", false]]);
  assert.equal(estado.chamadasYampi[0].consulta.get("limit"), "100");
});

test("recriarAviso apaga os avisos da nossa rota (até os de outro host), cria um com os cinco eventos e a URL da conexão e grava id e segredo selado", async () => {
  yampi = {
    "GET /loja-exemplo/webhooks": [200, { data: [
      { id: 11, url: `https://app.hubflow.com.br/api/integracoes/yampi/webhook?c=${CONEXAO_ID}`, active: true },
      { id: 12, url: urlDoAviso(CONEXAO_ID), active: false },
      { id: 13, url: "https://app.girumo.test/api/integracoes/yampi/webhook?c=outra-conexao", active: true },
      { id: 14, url: "https://bling.exemplo/hook", active: true },
    ] }],
    "DELETE /loja-exemplo/webhooks/11": [204, null],
    "DELETE /loja-exemplo/webhooks/12": [204, null],
    "POST /loja-exemplo/webhooks": [200, CRIADO],
  };
  await recriarAviso(conexao());
  assert.deepEqual(metodos("DELETE").map((c) => c.caminho), ["/loja-exemplo/webhooks/11", "/loja-exemplo/webhooks/12"]);
  assert.deepEqual(metodos("POST")[0]?.corpo, { name: "Girumo", url: urlDoAviso(CONEXAO_ID), events: [...EVENTOS_YAMPI] });
  const patch = estado.chamadas.find((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections");
  const salvo = patch?.corpo as { webhook_id: string; webhook_secret: string; status: string };
  assert.equal(patch?.url.searchParams.get("tenant_id"), `eq.${TENANT}`);
  assert.equal(salvo.status, "ativa");
  assert.equal(salvo.webhook_id, String(ID_DA_FIXTURE));
  assert.notEqual(salvo.webhook_secret, SECRET_KEY_DA_FIXTURE); // nunca em texto
  assert.equal(abrir(salvo.webhook_secret, contextoDoSegredo(TENANT, "webhook_secret"), CHAVE), SECRET_KEY_DA_FIXTURE);
});

test("recriarAviso: resposta sem secret_key apaga o aviso criado e lança; falha ao gravar também apaga o criado", async () => {
  yampi = {
    "GET /loja-exemplo/webhooks": [200, { data: [] }],
    "POST /loja-exemplo/webhooks": [200, { data: { id: 77 } }],
    "DELETE /loja-exemplo/webhooks/77": [204, null],
  };
  await assert.rejects(recriarAviso(conexao()), /não trouxe segredo/);
  assert.deepEqual(metodos("DELETE").map((c) => c.caminho), ["/loja-exemplo/webhooks/77"]);

  estado.chamadasYampi.length = 0;
  yampi = { ...yampi, "POST /loja-exemplo/webhooks": [200, CRIADO], [`DELETE /loja-exemplo/webhooks/${ID_DA_FIXTURE}`]: [204, null] };
  banco = { "PATCH /rest/v1/yampi_connections": [500, { message: "banco fora" }] };
  await assert.rejects(recriarAviso(conexao()), /banco fora/);
  assert.deepEqual(metodos("DELETE").map((c) => c.caminho), [`/loja-exemplo/webhooks/${ID_DA_FIXTURE}`]);
});
