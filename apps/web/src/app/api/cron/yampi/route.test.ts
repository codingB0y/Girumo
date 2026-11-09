import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { ENV, TENANT, linhaDaConexao, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { GET } from "./route";

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
let yampi: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => yampi, chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

beforeEach(() => {
  Object.assign(process.env, ENV);
  banco = {
    "GET /rest/v1/yampi_events": [200, []],
    "GET /rest/v1/yampi_connections": [200, []],
    "POST /rest/v1/rpc/limpar_dados_vencidos_comuns": [200, 3],
  };
  yampi = {};
  estado.chamadas.length = 0;
  estado.chamadasYampi.length = 0;
});

const pedido = (cabecalhos: Record<string, string> = { authorization: `Bearer ${ENV.CRON_SECRET}` }) =>
  new Request("https://app.girumo.test/api/cron/yampi", { headers: cabecalhos });
const caminhos = () => estado.chamadas.map((c) => `${c.metodo} ${c.url.pathname}`);

test("cron sem o secret certo: 401 e nada roda", async () => {
  for (const cabecalhos of [{}, { authorization: "Bearer outro-segredo-com-mais-de-24-caracteres" }] as Record<string, string>[]) {
    assert.equal((await GET(pedido(cabecalhos))).status, 401);
  }
  delete process.env.CRON_SECRET;
  assert.equal((await GET(pedido())).status, 401);
  assert.equal(estado.chamadas.length, 0);
});

test("sem a chave de cifra: 200 pulado e nenhuma consulta ao banco", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  const r = await GET(pedido());
  assert.deepEqual([r.status, await r.json()], [200, { ok: true, pulado: "indisponivel" }]);
  assert.equal(estado.chamadas.length, 0);
});

test("execução comum: consulta eventos e conexões, nunca chama a limpeza; a resposta só conta (sem id de loja)", async () => {
  const r = await GET(pedido());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, reprocessados: 0, conferidas: 0, avisosRecriados: 0, limpos: null, erros: 0 });
  assert.deepEqual(caminhos(), ["GET /rest/v1/yampi_events", "GET /rest/v1/yampi_connections"]);
});

test("com o cabeçalho x-vercel-cron-schedule da limpeza: só a função de limpeza é chamada", async () => {
  const r = await GET(pedido({ authorization: `Bearer ${ENV.CRON_SECRET}`, "x-vercel-cron-schedule": "0 6 * * *" }));
  assert.deepEqual(await r.json(), { ok: true, reprocessados: 0, conferidas: 0, avisosRecriados: 0, limpos: 3, erros: 0 });
  assert.deepEqual(caminhos(), ["POST /rest/v1/rpc/limpar_dados_vencidos_comuns"]);
});

test("passo que falha: o outro roda, resposta 500 com o resumo e sem id de loja", async (t) => {
  t.mock.method(console, "error", () => {});
  banco = {
    "GET /rest/v1/yampi_events": [500, { message: "banco fora" }],
    "GET /rest/v1/yampi_connections": [[200, [{ tenant_id: TENANT }]], [200, [linhaDaConexao()]]],
    "PATCH /rest/v1/yampi_connections": [200, []],
  };
  yampi = { "GET /loja-exemplo/webhooks": [200, { data: [{ id: 5611397, url: "https://x.exemplo/a", active: true }] }] };
  const r = await GET(pedido());
  assert.equal(r.status, 500);
  const corpo = await r.json();
  assert.deepEqual(corpo, { ok: false, reprocessados: 0, conferidas: 1, avisosRecriados: 0, limpos: null, erros: 1 });
  assert.doesNotMatch(JSON.stringify(corpo), new RegExp(TENANT));
});
