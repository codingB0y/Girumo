import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { ALIAS, CHAVE_SECRETA, CONEXAO_ID, ENV, TENANT, TOKEN, linhaDaConexao, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { yampiApagar, yampiGet, yampiPost, YampiErro } from "./api";
import type { ConexaoYampi } from "./tipos";

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
let yampi: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => yampi, chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

beforeEach(() => {
  Object.assign(process.env, ENV);
  banco = {};
  yampi = {};
  estado.chamadas.length = 0;
  estado.chamadasYampi.length = 0;
  estado.linhaDoTempo.length = 0;
});

/** A conexão como a store a entrega (credenciais seladas para a loja). */
function conexao(over: Partial<ConexaoYampi> = {}): ConexaoYampi {
  const l = linhaDaConexao();
  return {
    id: CONEXAO_ID, tenantId: TENANT, alias: ALIAS, status: "ativa",
    userTokenSelado: l.user_token as string, userSecretKeySelado: l.user_secret_key as string,
    webhookId: "5611397", webhookSecretSelado: l.webhook_secret as string,
    lastEventAt: null, lastCheckAt: null, lastError: null, ...over,
  };
}

const posts = (caminho: string) => estado.chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === caminho);
const patches = () => estado.chamadas.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections");

test("yampiGet abre as credenciais seladas, chama a Yampi com os cabeçalhos e devolve o JSON", async () => {
  yampi = { "GET /loja-exemplo/orders": [200, { data: [{ id: 1 }] }] };
  assert.deepEqual(await yampiGet(conexao(), "/orders", { limit: 1 }), { data: [{ id: 1 }] });
  const [chamada] = estado.chamadasYampi;
  assert.deepEqual([chamada.cabecalhos["user-token"], chamada.cabecalhos["user-secret-key"], chamada.consulta.get("limit")], [TOKEN, CHAVE_SECRETA, "1"]);
  assert.equal(estado.chamadas.length, 0, "o caminho feliz não toca no banco");
});

test("401 marca a conexão como credencial_invalida, avisa no sino uma vez e lança YampiErro 401; a conexão relida nem chega à Yampi", async () => {
  banco = {
    "PATCH /rest/v1/yampi_connections": [[200, [{ tenant_id: TENANT }]], [200, []]],
    "GET /rest/v1/notifications": [200, []],
    "POST /rest/v1/notifications": [201, []],
  };
  yampi = { "GET /loja-exemplo/orders": [401, { message: "Unauthenticated." }] };
  await assert.rejects(yampiGet(conexao(), "/orders"), (e) => e instanceof YampiErro && e.status === 401);
  const [patch] = patches();
  assert.deepEqual([patch.url.searchParams.get("tenant_id"), (patch.corpo as { status: string }).status], [`eq.${TENANT}`, "credencial_invalida"]);
  const sino = posts("/rest/v1/notifications").map((c) => c.corpo as { tenant_id: string; type: string; title: string; href: string });
  assert.deepEqual(sino.map((n) => [n.tenant_id, n.type, n.title, n.href]), [[TENANT, "error", "A Yampi recusou o acesso", "/painel/configuracoes?secao=integracoes"]]);
  // 401 repetido com a conexão velha em memória: o PATCH condicional não muda nada e o sino não repete
  await assert.rejects(yampiGet(conexao(), "/orders"));
  assert.equal(posts("/rest/v1/notifications").length, 1);
  // a conexão relida (já inválida) nem sai
  const antes = estado.chamadasYampi.length;
  await assert.rejects(yampiGet(conexao({ status: "credencial_invalida" }), "/orders"), (e) => e instanceof YampiErro && e.status === 401);
  assert.equal(estado.chamadasYampi.length, antes);
});

test("conexão credencial_invalida ou desconectada: YampiErro 401 sem chamar a Yampi nem o banco", async () => {
  for (const status of ["credencial_invalida", "desconectada"] as const) {
    await assert.rejects(yampiGet(conexao({ status }), "/orders"), (e) => e instanceof YampiErro && e.status === 401);
  }
  assert.deepEqual([estado.chamadasYampi.length, estado.chamadas.length], [0, 0]);
});

test("aviso_desativado ainda chama a Yampi: a credencial vale", async () => {
  yampi = { "GET /loja-exemplo/orders": [200, { data: [] }] };
  await yampiGet(conexao({ status: "aviso_desativado" }), "/orders");
  assert.equal(estado.chamadasYampi.length, 1);
});

test("404 e 500 não marcam a conexão", async () => {
  yampi = { "GET /loja-exemplo/orders/9": [404, {}], "GET /loja-exemplo/orders": [500, {}] };
  await assert.rejects(yampiGet(conexao(), "/orders/9"), (e) => e instanceof YampiErro && e.status === 404);
  await assert.rejects(yampiGet(conexao(), "/orders"), (e) => e instanceof YampiErro && e.status === 500);
  assert.equal(patches().length, 0);
});

test("sem a chave de cifra: lança sem chamar a Yampi", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  await assert.rejects(yampiGet(conexao(), "/orders"), /INTEGRATIONS_ENCRYPTION_KEY/);
  assert.equal(estado.chamadasYampi.length, 0);
});

test("yampiPost manda o corpo em JSON e yampiApagar chama DELETE", async () => {
  yampi = { "POST /loja-exemplo/webhooks": [200, { data: { id: 9 } }], "DELETE /loja-exemplo/webhooks/9": [204, null] };
  assert.deepEqual(await yampiPost(conexao(), "/webhooks", { name: "Girumo" }), { data: { id: 9 } });
  await yampiApagar(conexao(), "/webhooks/9");
  assert.deepEqual(estado.chamadasYampi.map((c) => [c.metodo, c.caminho, c.corpo]), [
    ["POST", "/loja-exemplo/webhooks", { name: "Girumo" }],
    ["DELETE", "/loja-exemplo/webhooks/9", undefined],
  ]);
});
