import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { CHAVE_SECRETA, ENV, SEGREDO_DO_AVISO, TOKEN, linhaDaConexao, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { montarCartaoYampi } from "./cartao";
import { NAO_RELIGOU } from "./conferir";

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => ({}), chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

beforeEach(() => {
  Object.assign(process.env, ENV);
  estado.chamadas.length = 0;
});

const comLinha = (over: Record<string, unknown> = {}) => {
  banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao(over)]] };
};

test("o cartão devolve só o final do token, nunca o token, a chave nem o segredo do aviso", async () => {
  comLinha({ last_event_at: "2026-10-29T17:48:00.000Z", last_check_at: "2026-10-29T17:30:00.000Z", last_error: NAO_RELIGOU, status: "aviso_desativado" });
  const c = await montarCartaoYampi("loja-b");
  assert.deepEqual(c, {
    disponivel: true,
    conexao: {
      status: "aviso_desativado", alias: "loja-exemplo", token_final: TOKEN.slice(-4),
      ultimo_aviso_em: "2026-10-29T17:48:00.000Z", ultima_conferencia_em: "2026-10-29T17:30:00.000Z", ultimo_erro: NAO_RELIGOU,
    },
  });
  assert.doesNotMatch(JSON.stringify(c), new RegExp(`${TOKEN}|${CHAVE_SECRETA}|${SEGREDO_DO_AVISO}|v1\\.`));
  assert.equal(estado.chamadas[0].url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("last_error que não é uma frase do app não chega à tela; cifra que não abre: sem o final do token", async () => {
  comLinha({ last_error: "mensagem qualquer vinda de outro lugar", user_token: "v1.cifra.que.nao-abre" });
  const c = await montarCartaoYampi("loja-b");
  assert.deepEqual([c.conexao?.ultimo_erro, c.conexao?.token_final], [null, null]);
});

test("sem a chave de cifra: disponivel false e nenhuma consulta; desconectada ou sem linha: conexao null", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.deepEqual(await montarCartaoYampi("loja-b"), { disponivel: false, conexao: null });
  assert.equal(estado.chamadas.length, 0);

  Object.assign(process.env, ENV);
  comLinha({ status: "desconectada", user_token: null, user_secret_key: null });
  assert.deepEqual(await montarCartaoYampi("loja-b"), { disponivel: true, conexao: null });
  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  assert.deepEqual(await montarCartaoYampi("loja-b"), { disponivel: true, conexao: null });
});
