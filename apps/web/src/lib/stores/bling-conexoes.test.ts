import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import {
  atualizarConexao,
  contextoDoToken,
  desconectarConexao,
  lerConexao,
  lerConexaoPorEmpresa,
  listarConexoesParaSincronizar,
  marcarAlertaReconectar,
  marcarReconectar,
  pegarTrava,
  salvarTokensRenovados,
  soltarTrava,
} from "./bling-conexoes";
import { salvarConexao, type DadosDaConexao } from "./bling-conexoes-salvar";
import { consumirEstadoOAuth, criarEstadoOAuth } from "./bling-oauth-states";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de site-captures.test.ts). */

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
let respostas: { status: number; body: unknown }[] = [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    const proxima = respostas.shift() ?? { status: 200, body: [] };
    res.setHeader("Content-Type", "application/json");
    res.statusCode = proxima.status;
    res.end(JSON.stringify(proxima.body));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

function preparar(...lista: Array<[number, unknown]>): void {
  pedidos.length = 0;
  respostas = lista.map(([status, body]) => ({ status, body }));
}
const filtros = (i: number) => Object.fromEntries([...pedidos[i].url.searchParams].filter(([k]) => k !== "select"));
const corpo = (i: number) => pedidos[i].corpo as Record<string, unknown>;
const UMA_LINHA: [number, unknown] = [200, [{ tenant_id: "loja-a" }]];
const NENHUMA_LINHA: [number, unknown] = [200, []];

const LINHA = {
  tenant_id: "loja-a", company_id: "empresa-1", company_name: "Moda da Ana", status: "ativa",
  access_token_enc: "v1.a.b.c", refresh_token_enc: "v1.d.e.f", access_expires_at: "2026-10-13T18:00:00+00:00",
  token_version: 4, situations: [{ id: 9, nome: "Atendido", base: 9 }], situations_at: "2026-10-13T12:00:00+00:00",
  sale_situation_ids: [9, 4321], high_value: 500, meta_enabled: false, meta_campaign_id: "camp-1",
  backfill_from: "2026-07-15", backfill_until: "2026-10-13", backfill_page: 3, backfill_done_at: "2026-10-01T00:00:00+00:00",
  scan_cursor: "2026-10-13T12:00:00+00:00", paused_until: null, consecutive_failures: 2,
  last_webhook_at: null, last_scan_at: null, last_scan_change_at: null, last_sale_at: null,
  last_error: "caiu", last_error_at: "2026-10-13T11:00:00+00:00", reconnect_alerted_at: "2026-10-13T11:00:00+00:00",
  connected_at: "2026-10-01T12:00:00+00:00", key_fp: "0123456789abcdef", token_retry_at: null,
  scan_from: "2026-10-13T11:00:00+00:00", scan_slice_s: 1800, backfill_fails: 4,
};

const DADOS: DadosDaConexao = {
  companyId: "empresa-1",
  companyName: "Moda da Ana",
  accessTokenEnc: "v1.novo.acesso.x",
  refreshTokenEnc: "v1.novo.refresh.x",
  accessExpiresAt: new Date("2026-10-13T18:00:00Z"),
  situations: [
    { id: 6, nome: "Em aberto", base: 6 },
    { id: 9, nome: "Atendido", base: 9 },
    { id: 4321, nome: "Pago no Pix", base: 9 },
  ],
  connectedBy: "usuario-1",
  hoje: "2026-10-13",
  keyFp: "fedcba9876543210",
};

const AJUSTES_DA_LOJA = ["high_value", "meta_enabled", "meta_campaign_id", "scan_cursor"];
const HISTORICO = ["backfill_from", "backfill_until", "backfill_page", "backfill_fails", "backfill_done_at"];

test("o contexto da cifra separa a loja e o token", () => {
  assert.equal(contextoDoToken("loja-a", "access"), "bling:loja-a:access");
  assert.equal(contextoDoToken("loja-a", "refresh"), "bling:loja-a:refresh");
});

test("lerConexao filtra pela loja, converte numeric que chega como texto e descarta situações tortas", async () => {
  preparar([200, [{ ...LINHA, high_value: "500.00", situations: [{ id: "x" }] }]], NENHUMA_LINHA);
  const conexao = await lerConexao("loja-a");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", limit: "1" });
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("lease_holder"));
  assert.equal(conexao?.highValue, 500);
  assert.equal(conexao?.tokenVersion, 4);
  assert.deepEqual(conexao?.saleSituationIds, [9, 4321]);
  assert.deepEqual(conexao?.situations, []);
  assert.equal(conexao?.metaCampaignId, "camp-1");
  assert.deepEqual([conexao?.keyFp, conexao?.tokenRetryAt], ["0123456789abcdef", null]);
  // A passada da varredura em andamento: de onde ela continua e o tamanho da próxima fatia. O PostgREST
  // falso devolve a linha inteira: as colunas têm de estar no select, ou o banco de verdade não as manda.
  const colunas = (pedidos[0].url.searchParams.get("select") ?? "").split(",").map((c) => c.trim());
  assert.ok(colunas.includes("scan_slice_s") && colunas.includes("backfill_fails"), colunas.join(","));
  assert.deepEqual([conexao?.scanFrom, conexao?.scanSliceS], ["2026-10-13T11:00:00+00:00", 1800]);
  // As falhas seguidas da página atual do histórico (a 12ª pula a página).
  assert.equal(conexao?.backfillFails, 4);
  assert.equal(await lerConexao("loja-z"), null);
});

test("lerConexao: tamanho da fatia nulo (6 h) fica nulo, e numeric em texto vira número", async () => {
  preparar([200, [{ ...LINHA, scan_slice_s: null, backfill_fails: "11" }]]);
  const conexao = await lerConexao("loja-a");
  assert.deepEqual([conexao?.scanSliceS, conexao?.backfillFails], [null, 11]);
});

test("lerConexaoPorEmpresa busca só pelo id da empresa: é ela que descobre a loja", async () => {
  preparar([200, [LINHA]]);
  const conexao = await lerConexaoPorEmpresa("empresa-1");
  assert.deepEqual(filtros(0), { company_id: "eq.empresa-1", limit: "1" });
  assert.equal(conexao?.tenantId, "loja-a");
  assert.deepEqual(conexao?.situations, [{ id: 9, nome: "Atendido", base: 9 }]);
});

test("salvarConexao em loja nova insere com os padrões: versão 1, situações com hora, 90 dias de histórico", async () => {
  preparar(NENHUMA_LINHA, [201, []]);
  await salvarConexao("loja-a", DADOS);
  assert.deepEqual([pedidos[1].metodo, pedidos[1].url.pathname], ["POST", "/rest/v1/bling_connections"]);
  const b = corpo(1);
  assert.equal(b.tenant_id, "loja-a");
  assert.equal(b.status, "ativa");
  assert.equal(b.token_version, 1);
  assert.equal(b.access_token_enc, "v1.novo.acesso.x");
  assert.equal(b.refresh_token_enc, "v1.novo.refresh.x");
  assert.equal(b.access_expires_at, "2026-10-13T18:00:00.000Z");
  // Vazio no banco = a loja nunca escolheu: o padrão sai na hora das situações atuais (uma filha de
  // Atendido criada depois também conta). Gravar o padrão a congelaria como pedido para sempre.
  assert.ok(!("sale_situation_ids" in b));
  assert.deepEqual(b.situations, DADOS.situations);
  assert.equal(typeof b.situations_at, "string");
  assert.deepEqual(
    [b.backfill_from, b.backfill_until, b.backfill_page, b.backfill_fails, b.backfill_done_at],
    ["2026-07-15", "2026-10-13", 1, 0, null],
  );
  assert.equal(typeof b.scan_cursor, "string");
  assert.equal(b.connected_by, "usuario-1");
  // A impressão da chave que selou os tokens: chave trocada depois não vira "reconectar" à toa.
  assert.equal(b.key_fp, "fedcba9876543210");
});

test("reconectar troca tokens, sobe a versão e zera falhas, sem tocar nos ajustes nem no histórico terminado", async () => {
  preparar([200, [{ ...LINHA, status: "reconectar" }]], UMA_LINHA);
  await salvarConexao("loja-a", DADOS);
  assert.equal(pedidos[1].metodo, "PATCH");
  // A versão lida é a trava: renovação em voo com a versão antiga perde a corrida.
  assert.deepEqual(filtros(1), { tenant_id: "eq.loja-a", token_version: "eq.4" });
  const b = corpo(1);
  assert.equal(b.token_version, 5);
  assert.equal(b.status, "ativa");
  assert.equal(b.company_id, "empresa-1");
  assert.equal(b.access_token_enc, "v1.novo.acesso.x");
  for (const zerado of ["paused_until", "last_error", "last_error_at", "reconnect_alerted_at"]) {
    assert.equal(b[zerado], null, zerado);
  }
  assert.equal(b.consecutive_failures, 0);
  assert.equal(b.key_fp, "fedcba9876543210");
  // Par novo: o recuo de uma renovação que tinha falhado acabou.
  assert.ok("token_retry_at" in b && b.token_retry_at === null);
  // A trava fica: soltá-la deixaria outra execução começar junto com a que está rodando (que
  // adota o par novo no lote seguinte).
  for (const intocado of ["lease_holder", "lease_until"]) assert.ok(!(intocado in b), intocado);
  for (const mantido of [...AJUSTES_DA_LOJA, ...HISTORICO, "sale_situation_ids"]) assert.ok(!(mantido in b), mantido);
});

test("reconectar com histórico pela metade reabre o histórico; a loja que nunca escolheu as situações de venda segue sem escolha", async () => {
  preparar([200, [{ ...LINHA, sale_situation_ids: [], backfill_done_at: null }]], UMA_LINHA);
  await salvarConexao("loja-a", DADOS);
  const b = corpo(1);
  assert.ok(!("sale_situation_ids" in b));
  // As falhas seguidas eram da página de antes: o histórico reaberto começa da 1 sem nenhuma.
  assert.deepEqual(
    [b.backfill_from, b.backfill_until, b.backfill_page, b.backfill_fails, b.backfill_done_at],
    ["2026-07-15", "2026-10-13", 1, 0, null],
  );
  for (const mantido of AJUSTES_DA_LOJA) assert.ok(!(mantido in b), mantido);
});

test("situações que não carregaram no retorno: lista vazia e sem hora, nunca o padrão como se fosse da conta", async () => {
  preparar(NENHUMA_LINHA, [201, []]);
  await salvarConexao("loja-a", { ...DADOS, situations: [] });
  const b = corpo(1);
  // A hora nula faz o motor recarregar na primeira execução.
  assert.deepEqual([b.situations, b.situations_at], [[], null]);
  assert.ok(!("sale_situation_ids" in b));
});

test("reconexão com as situações falhando: mantém a lista que a conexão já tinha e só zera a hora (prova R2-S1b)", async () => {
  const boas = [{ id: 9, nome: "Atendido", base: 9 }, { id: 30, nome: "Pago", base: 9 }];
  preparar([200, [{ ...LINHA, situations: boas, sale_situation_ids: [9, 30] }]], UMA_LINHA);
  await salvarConexao("loja-a", { ...DADOS, situations: [] });
  const b = corpo(1);
  // Mutante (a prova): a lista ia a [] por cima da boa; o cartão mostrava só as padrão, sem "Pago", e o
  // Salvar seguinte mandava só Atendido — 90 dias de vendas em "Pago" saíam de orders.
  assert.ok(!("situations" in b), "a lista da conta fica");
  // A hora nula faz o motor reler na primeira execução.
  assert.ok("situations_at" in b && b.situations_at === null);
  assert.ok(!("sale_situation_ids" in b));
});

test("a linha da loja nasce entre a leitura e o insert (23505 na chave da loja): relê e atualiza", async () => {
  const conflito = { code: "23505", message: 'duplicate key value violates unique constraint "bling_connections_pkey"', details: "Key (tenant_id)=(loja-a) already exists.", hint: null };
  preparar(NENHUMA_LINHA, [409, conflito], [200, [LINHA]], UMA_LINHA);
  await salvarConexao("loja-a", DADOS);
  assert.deepEqual(pedidos.map((p) => p.metodo), ["GET", "POST", "GET", "PATCH"]);
  assert.equal(corpo(3).token_version, 5);
});

test("conta do Bling já ligada a outra loja (23505 no company_id): estoura em vez de insistir", async () => {
  const conflito = { code: "23505", message: 'duplicate key value violates unique constraint "bling_connections_company_id_key"', details: "Key (company_id)=(empresa-1) already exists.", hint: null };
  preparar(NENHUMA_LINHA, [409, conflito]);
  await assert.rejects(salvarConexao("loja-a", DADOS), /company_id/);
  assert.equal(pedidos.length, 2);
});

test("a versão mudou entre a leitura e a gravação: relê e tenta de novo; perdendo sempre, estoura", async () => {
  preparar([200, [LINHA]], NENHUMA_LINHA, [200, [{ ...LINHA, token_version: 5 }]], UMA_LINHA);
  await salvarConexao("loja-a", DADOS);
  assert.deepEqual(filtros(3), { tenant_id: "eq.loja-a", token_version: "eq.5" });
  assert.equal(corpo(3).token_version, 6);

  preparar([200, [LINHA]], NENHUMA_LINHA, [200, [LINHA]], NENHUMA_LINHA, [200, [LINHA]], NENHUMA_LINHA);
  await assert.rejects(salvarConexao("loja-a", DADOS), /mudou/);
});

test("salvarTokensRenovados grava só se a versão ainda é a lida, com a impressão da chave", async () => {
  const tokens = { accessTokenEnc: "v1.a2", refreshTokenEnc: "v1.r2", accessExpiresAt: new Date("2026-10-13T20:00:00Z"), keyFp: "fedcba9876543210" };
  preparar(UMA_LINHA, NENHUMA_LINHA);
  assert.equal(await salvarTokensRenovados("loja-a", 4, tokens), true);
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", token_version: "eq.4" });
  assert.deepEqual(
    [corpo(0).access_token_enc, corpo(0).refresh_token_enc, corpo(0).access_expires_at, corpo(0).token_version, corpo(0).key_fp],
    ["v1.a2", "v1.r2", "2026-10-13T20:00:00.000Z", 5, "fedcba9876543210"],
  );
  // O par novo encerra o recuo de uma renovação que tinha falhado.
  assert.ok("token_retry_at" in corpo(0) && corpo(0).token_retry_at === null);
  assert.equal(await salvarTokensRenovados("loja-a", 4, tokens), false);
});

test("marcarAlertaReconectar só é true na primeira vez", async () => {
  preparar(UMA_LINHA, NENHUMA_LINHA);
  assert.equal(await marcarAlertaReconectar("loja-a"), true);
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", reconnect_alerted_at: "is.null" });
  assert.equal(typeof corpo(0).reconnect_alerted_at, "string");
  assert.equal(await marcarAlertaReconectar("loja-a"), false);
});

test("marcarReconectar vale só para conexão ativa e solta a trava", async () => {
  preparar(NENHUMA_LINHA);
  await marcarReconectar("loja-a", "Bling recusou a renovação do token");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", status: "eq.ativa" });
  const b = corpo(0);
  assert.deepEqual([b.status, b.last_error, b.lease_holder, b.lease_until], ["reconectar", "Bling recusou a renovação do token", null, null]);
  assert.equal(typeof b.last_error_at, "string");
});

test("listarConexoesParaSincronizar: ativas fora da pausa, quem varreu há mais tempo primeiro", async () => {
  preparar([200, [{ tenant_id: "loja-a", backfill_done_at: null }, { tenant_id: "loja-b", backfill_done_at: "2026-10-01T00:00:00+00:00" }]]);
  const lojas = await listarConexoesParaSincronizar(new Date("2026-10-13T12:00:00Z"));
  assert.deepEqual(lojas, [{ tenantId: "loja-a", historicoPendente: true }, { tenantId: "loja-b", historicoPendente: false }]);
  assert.deepEqual(filtros(0), {
    status: "eq.ativa",
    or: "(paused_until.is.null,paused_until.lte.2026-10-13T12:00:00.000Z)",
    order: "last_scan_at.asc.nullsfirst",
  });
});

test("atualizarConexao grava os campos pedidos com updated_at, filtrando a loja", async () => {
  preparar(NENHUMA_LINHA);
  await atualizarConexao("loja-a", {
    backfill_page: 4,
    backfill_fails: 0,
    last_scan_at: "2026-10-13T12:00:00.000Z",
    scan_from: null,
    scan_slice_s: 600,
    token_retry_at: null,
  });
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a" });
  const b = corpo(0);
  assert.deepEqual(
    [b.backfill_page, b.backfill_fails, b.last_scan_at, b.scan_from, b.scan_slice_s, b.token_retry_at],
    [4, 0, "2026-10-13T12:00:00.000Z", null, 600, null],
  );
  assert.equal(typeof b.updated_at, "string");
  assert.deepEqual(Object.keys(b).sort(), ["backfill_fails", "backfill_page", "last_scan_at", "scan_from", "scan_slice_s", "token_retry_at", "updated_at"]);
});

test("desconectar devolve a conexão anterior e apaga tokens; sem conexão, null sem gravar", async () => {
  preparar([200, [LINHA]], NENHUMA_LINHA);
  const anterior = await desconectarConexao("loja-a");
  assert.equal(anterior?.refreshTokenEnc, "v1.d.e.f");
  assert.deepEqual(filtros(1), { tenant_id: "eq.loja-a" });
  const b = corpo(1);
  for (const apagado of ["access_token_enc", "refresh_token_enc", "access_expires_at", "company_id", "lease_holder", "lease_until"]) {
    assert.equal(b[apagado], null, apagado);
  }
  assert.equal(b.status, "desconectada");
  // Renovação em voo grava com a versão lida: perde a corrida e não devolve token à loja desconectada.
  assert.equal(b.token_version, 5);

  preparar(NENHUMA_LINHA);
  assert.equal(await desconectarConexao("loja-a"), null);
  assert.equal(pedidos.length, 1);
});

test("trava da loja: bling_claim e bling_release com os parâmetros das funções", async () => {
  preparar([200, true], [200, false], [200, null]);
  assert.equal(await pegarTrava("loja-a", "dono-1", 60), true);
  assert.equal(pedidos[0].url.pathname, "/rest/v1/rpc/bling_claim");
  assert.deepEqual(pedidos[0].corpo, { p_tenant: "loja-a", p_holder: "dono-1", p_seconds: 60 });
  assert.equal(await pegarTrava("loja-a", "dono-2", 60), false);
  await soltarTrava("loja-a", "dono-1");
  assert.equal(pedidos[2].url.pathname, "/rest/v1/rpc/bling_release");
  assert.deepEqual(pedidos[2].corpo, { p_tenant: "loja-a", p_holder: "dono-1" });
});

test("state do OAuth: cria limpando os vencidos da loja; consome uma vez e só dentro do prazo", async () => {
  const hash = "a".repeat(64);
  preparar(NENHUMA_LINHA, [201, []], [200, [{ tenant_id: "loja-a", user_id: "usuario-1" }]], NENHUMA_LINHA);
  await criarEstadoOAuth({ stateHash: hash, tenantId: "loja-a", userId: "usuario-1", expiraEm: new Date("2026-10-13T12:10:00Z") });
  assert.equal(pedidos[0].metodo, "DELETE");
  assert.equal(filtros(0).tenant_id, "eq.loja-a");
  assert.match(String(filtros(0).expires_at), /^lte\./);
  assert.deepEqual(corpo(1), { state_hash: hash, tenant_id: "loja-a", user_id: "usuario-1", expires_at: "2026-10-13T12:10:00.000Z" });

  const agora = new Date("2026-10-13T12:05:00Z");
  assert.deepEqual(await consumirEstadoOAuth(hash, agora), { tenantId: "loja-a", userId: "usuario-1" });
  assert.equal(pedidos[2].metodo, "DELETE");
  assert.deepEqual(filtros(2), { state_hash: `eq.${hash}`, expires_at: "gt.2026-10-13T12:05:00.000Z" });
  assert.equal(await consumirEstadoOAuth(hash, agora), null);
});

test("erro do banco estoura com a mensagem", async () => {
  preparar([500, { code: "XX000", message: "caiu", details: null, hint: null }]);
  await assert.rejects(lerConexao("loja-a"), /caiu/);
});
