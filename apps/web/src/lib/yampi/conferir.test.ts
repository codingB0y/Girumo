import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { CONEXAO_ID, ENV, TENANT, linhaDaConexao, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { conferirConexao } from "./conferir";
import { urlDoAviso } from "./webhooks";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const CRIADO = JSON.parse(readFileSync(join(FIXTURES, "webhook-criado.json"), "utf8")) as unknown;
const LISTA = JSON.parse(readFileSync(join(FIXTURES, "webhooks-lista.json"), "utf8")) as unknown; // o aviso 5611397, ativo

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
let yampi: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => yampi, chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

const comConexao = (over: Record<string, unknown> = {}) => ({
  "GET /rest/v1/yampi_connections": [200, [linhaDaConexao(over)]] as RespostaFalsa,
  "PATCH /rest/v1/yampi_connections": [200, [{ tenant_id: TENANT }]] as RespostaFalsa,
  "GET /rest/v1/notifications": [200, []] as RespostaFalsa,
  "POST /rest/v1/notifications": [201, []] as RespostaFalsa,
});

beforeEach(() => {
  Object.assign(process.env, ENV);
  banco = comConexao();
  yampi = {};
  estado.chamadas.length = 0;
  estado.chamadasYampi.length = 0;
});

const patches = () => estado.chamadas.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections").map((c) => c.corpo as Record<string, unknown>);
const nossoNaYampi = (ativo: boolean) => ({ data: [{ id: 5611397, url: urlDoAviso(CONEXAO_ID), active: ativo, disabled_at: null }] });
const recriando = (lista: unknown): typeof yampi => ({
  "GET /loja-exemplo/webhooks": [200, lista],
  "DELETE /loja-exemplo/webhooks/5611397": [204, null],
  "POST /loja-exemplo/webhooks": [200, CRIADO],
});

test("conferirConexao: aviso ativo só atualiza last_check_at e limpa o erro; nada é recriado", async () => {
  yampi = { "GET /loja-exemplo/webhooks": [200, LISTA] };
  assert.deepEqual(await conferirConexao(TENANT), { credenciais: "ok", aviso: "ativo" });
  assert.equal(estado.chamadasYampi.filter((c) => c.metodo !== "GET").length, 0);
  const [patch] = patches();
  assert.deepEqual([patch.status, patch.last_error], ["ativa", null]);
  assert.ok(patch.last_check_at);
});

test("conferirConexao: aviso desativado (a Yampi desliga depois de 30 falhas) ou ausente é recriado", async () => {
  for (const lista of [nossoNaYampi(false), { data: [] }]) {
    estado.chamadasYampi.length = 0;
    yampi = recriando(lista);
    assert.deepEqual(await conferirConexao(TENANT), { credenciais: "ok", aviso: "recriado" });
    assert.equal(estado.chamadasYampi.filter((c) => c.metodo === "POST").length, 1);
  }
});

test("conferirConexao: falha ao recriar vira aviso_desativado com last_error escrito e resultado aviso: falhou", async () => {
  yampi = { "GET /loja-exemplo/webhooks": [200, { data: [] }], "POST /loja-exemplo/webhooks": [422, { message: "url inválida" }] };
  assert.deepEqual(await conferirConexao(TENANT), { credenciais: "ok", aviso: "falhou" });
  const ultimo = patches().at(-1) ?? {};
  assert.deepEqual([ultimo.status, ultimo.last_error], ["aviso_desativado", "Não foi possível religar o aviso na Yampi."]);
});

test("conferirConexao: 401 vira credencial inválida (a conexão é marcada e o sino avisa)", async () => {
  yampi = { "GET /loja-exemplo/webhooks": [401, { message: "Unauthenticated." }] };
  assert.deepEqual(await conferirConexao(TENANT), { credenciais: "invalida", aviso: "desconhecido" });
  assert.equal(patches()[0]?.status, "credencial_invalida");
  assert.equal(estado.chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications").length, 1);
});

test("conferirConexao: Yampi fora grava last_error e last_check_at e mantém o status", async () => {
  yampi = { "GET /loja-exemplo/webhooks": [503, {}] }; // o cliente tenta 3 vezes (1 s + 3 s)
  assert.deepEqual(await conferirConexao(TENANT), { credenciais: "erro", aviso: "desconhecido" });
  const [patch] = patches();
  assert.deepEqual(Object.keys(patch).sort(), ["last_check_at", "last_error"]);
  assert.equal(patch.last_error, "A Yampi não respondeu na última conferência.");
});

test("conferirConexao: credencial_invalida não chama a Yampi; sem conexão ou desconectada devolve null", async () => {
  banco = comConexao({ status: "credencial_invalida" });
  assert.deepEqual(await conferirConexao(TENANT), { credenciais: "invalida", aviso: "desconhecido" });
  banco = comConexao({ status: "desconectada" });
  assert.equal(await conferirConexao(TENANT), null);
  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  assert.equal(await conferirConexao(TENANT), null);
  assert.equal(estado.chamadasYampi.length, 0);
});

test("conferirConexao: toda escrita é da mesma conexão viva — a loja que desconectou no meio não volta a ativa", async () => {
  const linha = linhaDaConexao();
  for (const cenario of [
    { "GET /loja-exemplo/webhooks": [200, LISTA] },            // ativo
    { "GET /loja-exemplo/webhooks": [503, { erro: "fora" }] },  // Yampi fora
    { ...recriando(nossoNaYampi(false)), "POST /loja-exemplo/webhooks": [500, { erro: "fora" }] }, // não religou
  ] as Array<typeof yampi>) {
    estado.chamadas.length = 0;
    banco = { ...comConexao(), "GET /rest/v1/yampi_connections": [200, [linha]] };
    yampi = cenario;
    await conferirConexao(TENANT);
    const escritas = estado.chamadas.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections");
    assert.ok(escritas.length > 0);
    for (const c of escritas) {
      assert.equal(c.url.searchParams.get("user_token"), `eq.${linha.user_token as string}`);
      assert.equal(c.url.searchParams.get("status"), "in.(ativa,aviso_desativado)");
    }
  }
});
