import assert from "node:assert/strict";
import { test } from "node:test";

import { selar } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";
import {
  AGORA,
  ajustarConexao,
  avisar,
  chamadasDoBling,
  CHAVE,
  criarBlingFalso,
  HORA,
  iso,
  json,
  linhaPendente,
  LOJA,
  MINUTO,
  pedidoDoBling,
  pendentes,
  salvarNoCartao,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { idDaVendaBling } from "./pedido-girumo";
import { sincronizarLoja, type Gatilho } from "./sincronizar";
import type { PedidoResumo } from "./tipos";

/**
 * O motor de ponta a ponta contra o mundo falso (`src/test/bling-falso.ts`), no caminho normal:
 * trava, varredura, histórico, fila em lotes, ajustes que mudam no meio e orçamento. Os erros, o
 * token e o disjuntor estão em `sincronizar-erros.test.ts`; as fatias da varredura e o histórico
 * que relê, em `sincronizar-varredura.test.ts`.
 */

function rodar(f: BlingFalso, gatilho: Gatilho = "cron", orcamentoMs = 60_000) {
  return sincronizarLoja(LOJA, gatilho, orcamentoMs, VIDA[gatilho], f.deps);
}

/** Pedidos no Bling e as linhas deles na fila (aviso: sem retrato, cada um custa um GET). */
function comPedidos(f: BlingFalso, ...ids: number[]): void {
  for (const id of ids) {
    f.bling.pedidos.set(id, pedidoDoBling(id));
    f.pedidos.set(id, linhaPendente(id));
  }
}

/** Linhas da varredura, com o retrato: processar não chama o Bling (o contato fica no cache). */
function comRetratos(f: BlingFalso, quantos: number, extra: Partial<PedidoResumo> = {}): void {
  for (let i = 0; i < quantos; i += 1) {
    f.pedidos.set(5000 + i, linhaPendente(5000 + i, { origin: "varredura", snapshot: pedidoDoBling(5000 + i, extra) }));
  }
}

const listagens = (f: BlingFalso, filtro: string) => chamadasDoBling(f, "/pedidos/vendas").filter((c) => c.query.has(filtro));
const linha = (f: BlingFalso, id: number) => f.pedidos.get(id);

test("trava de outra execução: não faz nada (quem tem a trava drena)", async () => {
  const f = criarBlingFalso();
  f.trava = { dono: "outra-execucao", ate: AGORA + MINUTO };
  comPedidos(f, 1001);
  const r = await rodar(f);

  assert.deepEqual(r, { tenantId: LOJA, trava: false, processados: 0, falhas: 0, varredura: 0, historico: 0 });
  assert.deepEqual(f.trilha, ["conexoes.pegarTrava 90"]);
  assert.equal(f.bling.chamadas.length, 0);
  assert.equal(linha(f, 1001)?.pending, true);
});

test("sem credenciais do app ou sem chave de cifra: indisponível, sem tocar no banco nem no Bling", async () => {
  for (const falta of ["credenciais", "chave"] as const) {
    const f = criarBlingFalso();
    if (falta === "credenciais") f.credenciais = null;
    else f.chave = null;
    comPedidos(f, 1001);
    const r = await rodar(f);
    assert.equal(r.parou, "indisponivel", falta);
    assert.deepEqual([f.trilha, f.bling.chamadas.length], [[], 0], falta);
  }
});

test("gatilho aviso: só drena a fila, sem varredura nem histórico, e sem recálculo da loja toda", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: null, backfillDoneAt: null });
  f.bling.paginas = () => [pedidoDoBling(2001)];
  comPedidos(f, 1001);
  const r = await rodar(f, "aviso", 45_000);

  assert.deepEqual([r.trava, r.processados, r.varredura, r.historico, r.parou], [true, 1, 0, 0, undefined]);
  assert.equal(chamadasDoBling(f, "/pedidos/vendas").length, 0);
  assert.ok(!f.trilha.includes("contatos.recalcularListas loja"));
  assert.equal(f.trava, null, "solta a trava no fim");
});

test("cron: varredura do cursor (−4 h) até agora, cursor avança na página vazia e só o que mudou volta à fila", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - HORA) });
  f.bling.paginas = (q) => (q.get("pagina") === "1" ? [pedidoDoBling(2001), pedidoDoBling(2002, { situacaoId: 6, total: 80 })] : []);
  const r = await rodar(f);

  const varreduras = listagens(f, "dataAlteracaoInicial");
  assert.deepEqual(varreduras.map((c) => c.query.get("pagina")), ["1", "2"]);
  const [primeira] = varreduras;
  assert.deepEqual(
    [primeira.query.get("dataAlteracaoInicial"), primeira.query.get("dataAlteracaoFinal"), primeira.query.get("limite")],
    ["2026-10-13 07:00:00", "2026-10-13 12:00:00", "100"],
  );
  assert.deepEqual([r.varredura, r.processados], [2, 2]);
  assert.deepEqual([linha(f, 2001)?.origin, linha(f, 2001)?.kind, linha(f, 2002)?.kind], ["varredura", "venda", "pedido"]);
  // O cursor vai ao começo da passada; `last_scan_at` é o último avanço (a página vazia, 350 ms depois).
  assert.deepEqual([f.conexao?.scanCursor, f.conexao?.lastScanAt], [iso(AGORA), iso(AGORA + 350)]);
  // Passada completa: nenhuma em andamento.
  assert.equal(f.conexao?.scanFrom, null);
  const mudanca = f.conexao?.lastScanChangeAt;
  assert.ok(mudanca);
  assert.ok(f.trilha.includes("contatos.recalcularListas loja"), "cron que processou recalcula a loja toda");

  // 5 min depois, os mesmos pedidos sem mudança: nada volta à fila.
  f.agora += 5 * MINUTO;
  const deNovo = await rodar(f);
  assert.deepEqual([deNovo.varredura, deNovo.processados, f.conexao?.lastScanChangeAt], [0, 0, mudanca]);
});

test("cron: histórico de 2 páginas e a 3ª vazia termina, grava a página a cada passo e recalcula a loja", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1 });
  const antigo = (id: number) => pedidoDoBling(id, { data: "2026-08-01" });
  const paginas: Record<string, PedidoResumo[]> = { "1": [antigo(4001), antigo(4002)], "2": [antigo(4003)] };
  f.bling.paginas = (q) => (q.has("dataInicial") ? (paginas[q.get("pagina") ?? ""] ?? []) : []);
  const r = await rodar(f);

  const historico = listagens(f, "dataInicial");
  assert.deepEqual(historico.map((c) => c.query.get("pagina")), ["1", "2", "3"]);
  assert.deepEqual([historico[0].query.get("dataInicial"), historico[0].query.get("dataFinal")], ["2026-07-15", "2026-10-13"]);
  assert.deepEqual(f.atualizacoes.flatMap((a) => (a.backfill_page === undefined ? [] : [a.backfill_page])), [2, 3]);
  assert.equal(r.historico, 3);
  assert.ok(f.conexao?.backfillDoneAt);
  assert.deepEqual(
    [4001, 4002, 4003].map((id) => [linha(f, id)?.origin, linha(f, id)?.kind, linha(f, id)?.purchaseStatus]),
    [4001, 4002, 4003].map(() => ["historico", "venda", "fora_da_janela"]),
  );
  assert.ok(f.trilha.includes("contatos.recalcularListas loja"));
});

test("fila de 25: lotes de 20 até esvaziar, sem segunda rodada, e a última venda gravada uma vez", async () => {
  const f = criarBlingFalso();
  comRetratos(f, 25);
  const r = await rodar(f);

  assert.deepEqual([r.processados, r.parou, pendentes(f).length], [25, undefined, 0]);
  assert.equal(f.trilha.filter((t) => t === "pedidos.listarPendentes 20").length, 3);
  // A trava da rodada e a renovação antes de cada um dos 3 lotes, sempre com o mesmo dono (uma rodada só).
  assert.equal(f.trilha.filter((t) => t.startsWith("conexoes.pegarTrava")).length, 4);
  assert.deepEqual([f.contadores.donos, f.trilha.filter((t) => t === "conexoes.soltarTrava").length], [1, 1]);
  assert.equal(f.atualizacoes.filter((a) => a.last_sale_at !== undefined).length, 1);
  assert.equal(f.conexao?.lastSaleAt, linha(f, 5024)?.saleAt);
});

test("trava tomada por outra execução no meio da fila: o lote seguinte não roda e o resto fica pendente intacto", async () => {
  const f = criarBlingFalso();
  comRetratos(f, 25);
  f.gancho = (entrada) => {
    // A trava venceu (função lenta, relógio do banco) e outra execução a pegou enquanto o lote 1 terminava.
    if (entrada === "pedidos.salvarProcessado 5019 true") f.trava = { dono: "outra-execucao", ate: f.agora + 10 * MINUTO };
  };
  const r = await rodar(f);

  // Mutante: sem renovar a trava a cada lote, as duas execuções drenariam a mesma fila juntas.
  assert.deepEqual([r.parou, r.processados, pendentes(f).length], ["trava", 20, 5]);
  assert.ok(pendentes(f).every((l) => l.attempts === 0 && l.lastError === null));
  assert.equal(f.trava?.dono, "outra-execucao", "a trava de quem a tomou fica");
});

test("pedido do aviso não espera atrás do histórico: o que só o histórico marcou vai depois na fila", async () => {
  const f = criarBlingFalso();
  for (let i = 0; i < 25; i += 1) {
    const antigo = pedidoDoBling(4000 + i, { data: "2026-08-01" });
    f.pedidos.set(4000 + i, linhaPendente(4000 + i, { origin: "historico", lowPriority: true, snapshot: antigo, nextTryAt: iso(AGORA - HORA) }));
  }
  comPedidos(f, 1001);
  await rodar(f, "aviso");

  const ordem = f.trilha.filter((t) => t.startsWith("pedidos.salvarProcessado")).map((t) => t.split(" ")[1]);
  assert.deepEqual([ordem[0], ordem.length], ["1001", 26]);
});

test("404 de passagem marca o pedido excluído; a varredura que ainda o lista reabre, e a venda volta com o mesmo id", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  f.bling.pedidos.set(1001, pedidoDoBling(1001));
  avisar(f, 1001);
  await rodar(f, "aviso", 45_000);
  assert.deepEqual([linha(f, 1001)?.kind, [...f.girumo.keys()]], ["venda", [idDaVendaBling(LOJA, 1001)]]);

  // order.updated chega e o Bling responde 404 uma vez (réplica atrasada, instabilidade).
  f.agora += MINUTO;
  f.bling.forcadas.push({ caminho: /^\/pedidos\/vendas\/1001$/, vezes: 1, resposta: () => json(404, { error: { type: "RESOURCE_NOT_FOUND" } }) });
  avisar(f, 1001);
  await rodar(f, "aviso", 45_000);
  assert.deepEqual([linha(f, 1001)?.kind, f.girumo.size], ["excluido", 0]);

  // O pedido segue vivo no Bling e aparece na varredura, sem mudança nenhuma.
  f.agora += 5 * MINUTO;
  ajustarConexao(f, { lastScanAt: iso(f.agora - 10 * MINUTO), scanCursor: iso(f.agora - 30 * MINUTO) });
  f.bling.paginas = (q) => (q.has("dataAlteracaoInicial") && q.get("pagina") === "1" ? [pedidoDoBling(1001)] : []);
  await rodar(f);

  // A prova do revisor: ficava excluído para sempre e a venda sumia do funil.
  assert.deepEqual([linha(f, 1001)?.kind, [...f.girumo.keys()]], ["venda", [idDaVendaBling(LOJA, 1001)]]);
  assert.equal(f.meta.enviados.length, 1, "os eventos já enviados não saem de novo");
});

test("ajuste do cartão no meio da execução: o lote seguinte classifica com as situações de venda novas", async () => {
  const f = criarBlingFalso();
  // "Pago no Pix" (4321) ainda não conta como venda nesta loja.
  ajustarConexao(f, { saleSituationIds: [9] });
  comRetratos(f, 25, { situacaoId: 4321 });
  f.gancho = (entrada) => {
    // O PATCH do cartão chega enquanto o primeiro lote termina.
    if (entrada === "pedidos.salvarProcessado 5019 true") ajustarConexao(f, { saleSituationIds: [9, 4321] });
  };
  await rodar(f);

  const tipos = Array.from({ length: 25 }, (_, i) => linha(f, 5000 + i)?.kind);
  assert.deepEqual(tipos, [...Array<string>(20).fill("pedido"), ...Array<string>(5).fill("venda")]);
});

/** O Salvar do cartão que passa "Pago no Pix" (4321) a contar como venda e reabre os 90 dias. */
const salvarPagoComoVenda = (f: BlingFalso) => salvarNoCartao(f, { saleSituationIds: [9, 4321] }, "2026-07-15");
const tiposDas25 = (f: BlingFalso) => Array.from({ length: 25 }, (_, i) => linha(f, 5000 + i)?.kind);
const VINTE_E_CINCO_VENDAS = Array<string>(25).fill("venda");

test("Salvar do cartão logo depois de o lote ler a conexão: nenhum pedido termina com o ajuste velho", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { saleSituationIds: [9] });
  // Linhas que nunca foram processadas, como as do histórico importando na 1ª configuração.
  comRetratos(f, 25, { situacaoId: 4321 });
  // A 1ª leitura da conexão abre a rodada; a 2ª é a do lote, e o Salvar entra na chamada seguinte a ela: o lote já
  // listou e leu o ajuste velho, e a reabertura troca a versão das linhas dele (a gravação delas falha).
  let leituras = 0;
  f.gancho = (entrada) => {
    if (leituras < 2) {
      if (entrada === "conexoes.lerConexao") leituras += 1;
      return;
    }
    f.gancho = null;
    salvarPagoComoVenda(f);
  };
  await rodar(f, "aviso");

  // Mutante (relê a conexão e só depois lista): o Salvar caía entre a leitura e a listagem, o lote listava as linhas
  // reabertas, processava com o ajuste velho e a gravação guardada passava — 20 vendas ficavam pedido para sempre.
  assert.deepEqual(tiposDas25(f), VINTE_E_CINCO_VENDAS);
  assert.equal(f.girumo.size, 25);
});

test("Salvar do cartão no meio do lote: o que já gravou volta à fila, o que está em andamento perde a gravação, e tudo termina venda", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { saleSituationIds: [9] });
  comRetratos(f, 25, { situacaoId: 4321 });
  f.gancho = (entrada) => {
    if (entrada !== "pedidos.salvarProcessado 5004 true") return;
    f.gancho = null;
    salvarPagoComoVenda(f);
  };
  await rodar(f, "aviso");

  // 5000–5004 já gravaram (com dia) e a reabertura as devolve; 5005–5019 estão em andamento e nunca foram processadas
  // (sem dia): só a versão nova que a reabertura dá também à linha sem dia faz a gravação delas falhar.
  assert.deepEqual(tiposDas25(f), VINTE_E_CINCO_VENDAS);
  assert.deepEqual([pendentes(f).length, f.girumo.size], [0, 25]);
});

test("reconexão no meio da execução: o lote seguinte já usa o par novo, sem 401 nem renovação", async () => {
  const f = criarBlingFalso();
  comPedidos(f, ...Array.from({ length: 25 }, (_, i) => 6000 + i));
  f.gancho = (entrada) => {
    if (entrada !== "pedidos.salvarProcessado 6019 true") return;
    ajustarConexao(f, {
      tokenVersion: 4,
      accessTokenEnc: selar("access-reconectado", contextoDoToken(LOJA, "access"), CHAVE),
      refreshTokenEnc: selar("refresh-reconectado", contextoDoToken(LOJA, "refresh"), CHAVE),
    });
    f.bling.aceitos = new Set(["access-reconectado"]);
    f.bling.refreshValido = "refresh-reconectado";
  };
  const r = await rodar(f);

  assert.equal(r.processados, 25);
  assert.equal(chamadasDoBling(f, "/oauth/token").length, 0);
  const tokens = f.bling.chamadas.filter((c) => /^\/pedidos\/vendas\/602[0-4]$/.test(c.caminho)).map((c) => c.token);
  assert.deepEqual(tokens, Array<string>(5).fill("access-reconectado"));
});

test("loja desligada no cartão no meio da execução: o lote seguinte não roda", async () => {
  const f = criarBlingFalso();
  comRetratos(f, 25);
  f.gancho = (entrada) => {
    if (entrada === "pedidos.salvarProcessado 5019 true") ajustarConexao(f, { status: "desconectada" });
  };
  const r = await rodar(f);

  assert.deepEqual([r.parou, r.processados, pendentes(f).length], ["inativa", 20, 5]);
});

test("orçamento acaba no meio da fila: linha nova só com 20 s sobrando; para, solta a trava e deixa o resto sem queimar tentativa", async () => {
  const f = criarBlingFalso();
  comPedidos(f, ...Array.from({ length: 60 }, (_, i) => 6000 + i));
  const r = await rodar(f, "aviso", 30_000);

  assert.equal(r.parou, "orcamento");
  assert.equal(f.trava, null);
  const restantes = pendentes(f);
  assert.ok(r.processados > 0 && restantes.length > 0, `${r.processados} processados, ${restantes.length} pendentes`);
  assert.equal(r.processados + restantes.length, 60);
  assert.ok(restantes.every((l) => l.attempts === 0 && l.lastError === null));
  // Mutante: com 5 s de piso a fila seguia até 25 s, e a Vercel podia matar a função no meio de uma linha.
  assert.ok(f.agora - AGORA <= 11_000, `parou em ${f.agora - AGORA} ms`);
});
