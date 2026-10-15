import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  alterados,
  capturarLogs,
  chamadasDoBling,
  criarBlingFalso,
  fatiasLidas,
  foraDaFila,
  HORA,
  iso,
  json,
  listaPorAlteracao,
  LOJA,
  MINUTO,
  pedidoDoBling,
  trocarListagem,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * A varredura em fatias de tempo (spec §3 "Varredura") contra o mundo falso: cada fatia é lida inteira
 * numa execução, o progresso só anda na fronteira de uma fatia, a fatia grande demais divide, o tamanho
 * da fatia fica guardado para a próxima execução, a varredura parada aparece no cartão, e nada se perde
 * quando a lista do Bling muda entre uma leitura e outra (o Bling pagina por posição). O bloco denso está
 * em `sincronizar-varredura-densa.test.ts`, o histórico em `sincronizar-historico.test.ts` e o caminho
 * normal do motor em `sincronizar.test.ts`.
 */

function rodar(f: BlingFalso, orcamentoMs = 60_000) {
  return sincronizarLoja(LOJA, "cron", orcamentoMs, VIDA.cron, f.deps);
}

/** As gravações de progresso da varredura, na ordem: de onde a passada continua, o cursor e se marcou mudança. */
const progresso = (f: BlingFalso) =>
  f.atualizacoes
    .filter((a) => a.scan_from !== undefined || a.scan_cursor !== undefined || a.last_scan_at !== undefined)
    .map((a) => [a.scan_from, a.scan_cursor, a.last_scan_change_at !== undefined]);

/** O tamanho da próxima fatia (s), a cada gravação. */
const candidatos = (f: BlingFalso) => f.atualizacoes.flatMap((a) => (a.scan_slice_s === undefined ? [] : [a.scan_slice_s]));

test("fatia grande demais divide e completa; as pequenas crescem; o progresso só anda na fronteira de uma fatia inteira", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - 10 * HORA), metaEnabled: false });
  // 1500 pedidos entre −14 h e −8 h (um a cada 14,4 s): as primeiras 6 h não cabem em 10 páginas.
  const alteradoEm = alterados(20_000, 1500, AGORA - 14 * HORA + 7_000, 14_400);
  f.bling.paginas = listaPorAlteracao(alteradoEm);
  const r = await rodar(f);

  assert.deepEqual(fatiasLidas(f), [
    // 6 h: 10 páginas cheias e nenhuma vazia → metade, de novo da página 1.
    "2026-10-12 22:00:00 → 2026-10-13 04:00:00: 10",
    // 3 h: 750 pedidos e a vazia.
    "2026-10-12 22:00:00 → 2026-10-13 01:00:00: 9",
    // Dobra: 6 h.
    "2026-10-13 01:00:00 → 2026-10-13 07:00:00: 9",
    // Dobraria para 12 h: vai só até o fim da passada.
    "2026-10-13 07:00:00 → 2026-10-13 12:00:00: 1",
  ]);
  // Uma gravação por fatia inteira; a que não coube não grava progresso. A última fecha a passada.
  assert.deepEqual(progresso(f), [
    [iso(AGORA - 11 * HORA), undefined, true],
    [iso(AGORA - 5 * HORA), undefined, true],
    [null, iso(AGORA), false],
  ]);
  // O tamanho da próxima fatia vai ao banco a cada mudança: a metade na hora (sozinha), o dobro com o progresso.
  // A última, cortada no fim da passada (5 h), coube mas não encolhe o tamanho guardado (12 h).
  assert.deepEqual(candidatos(f), [3 * 3600, 6 * 3600, 12 * 3600]);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor, f.conexao?.scanSliceS], [null, iso(AGORA), 12 * 3600]);
  assert.deepEqual([foraDaFila(f, alteradoEm.keys()), r.varredura], [[], 1500]);
});

test("a execução começa do tamanho de fatia guardado, não de 6 h: 30 min, e dobra a cada fatia inteira", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - HORA), scanSliceS: 1800 });
  await rodar(f);

  assert.deepEqual(fatiasLidas(f), [
    "2026-10-13 07:00:00 → 2026-10-13 07:30:00: 1",
    "2026-10-13 07:30:00 → 2026-10-13 08:30:00: 1",
    "2026-10-13 08:30:00 → 2026-10-13 10:30:00: 1",
    "2026-10-13 10:30:00 → 2026-10-13 12:00:00: 1",
  ]);
  assert.deepEqual(candidatos(f), [3600, 7200, 14_400]);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor], [null, iso(AGORA)]);
});

test("nenhum pedido se perde quando a lista muda entre execuções (prova R1-1): a fatia interrompida é relida inteira", async () => {
  const f = criarBlingFalso();
  // Loja atrasada (30 h sem varrer) e um orçamento que não cabe a passada: 8 páginas por execução (o resto
  // é a reserva da fila), e a fatia que dobrou não cabe no que sobra.
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - 30 * HORA), metaEnabled: false });
  const alteradoEm = alterados(10_000, 1200, AGORA - 34 * HORA + MINUTO, 101_900);
  f.bling.paginas = listaPorAlteracao(alteradoEm);
  const cron = (n: number) => AGORA + n * 5 * MINUTO;
  let execucao = 0;
  for (; execucao < 12; execucao += 1) {
    f.agora = cron(execucao);
    await rodar(f, 32_200);
    if (!f.conexao?.scanFrom) break;
    // A vendedora mexe de novo em 5 pedidos já lidos da parte que falta: saem da janela e puxam a lista
    // para trás. Na janela congelada de antes, o primeiro da página seguinte caía numa já lida.
    const daqui = Date.parse(f.conexao.scanFrom);
    const lidos = [...alteradoEm].filter(([id, t]) => t >= daqui && f.pedidos.has(id)).map(([id]) => id);
    for (const id of lidos.sort((a, b) => a - b).slice(0, 5)) alteradoEm.set(id, cron(execucao + 1));
  }

  assert.ok(execucao >= 2, `a passada coube em ${execucao + 1} execução(ões): o teste não provaria nada`);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor], [null, iso(cron(execucao))]);
  // A prova do revisor perdia o 11000 (e qualquer um na mesma posição): aqui nenhum fica de fora.
  assert.deepEqual(foraDaFila(f, alteradoEm.keys()), []);
});

test("página que falha sempre (prova R1-2): a varredura não anda nem finge que anda; depois de 1 h o cartão avisa, e o teto de 72 h libera", async () => {
  const logs = capturarLogs();
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - 30 * HORA) });
  // 3002 está corrompido no Bling: a página que o traria dá 500 (o cliente tenta 3 vezes). 9001 é uma
  // venda nova cujo aviso se perdeu.
  const alteradoEm = new Map([[3001, AGORA - 25 * HORA], [3002, AGORA - 20 * HORA], [3003, AGORA - 12 * HORA], [9001, AGORA + 10 * MINUTO]]);
  f.bling.paginas = listaPorAlteracao(alteradoEm);
  trocarListagem(f, (q) => (f.bling.paginas(q).some((p) => p.id === 3002) ? json(500, { error: { type: "INTERNAL_ERROR", message: "erro interno" } }) : null));
  const presa = { scanFrom: iso(AGORA - 22 * HORA), scanCursor: iso(AGORA - 30 * HORA) };
  try {
    // Até +5 min a passada anda (−34 h → −28 h → −22 h); dali em diante a fatia com o 3002 falha sempre. A
    // fatia que falha volta a 6 h (a 1ª execução tinha dobrado para 12 h): só 6 h ficam presas antes do 3002.
    await rodar(f);
    f.agora = AGORA + 5 * MINUTO;
    await rodar(f);
    const ultimoAvanco = f.conexao?.lastScanAt;
    assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor], [presa.scanFrom, presa.scanCursor]);
    for (let mais = 10; mais <= 55; mais += 5) {
      f.agora = AGORA + mais * MINUTO;
      await rodar(f);
    }
    // Parada há 50 min: o progresso não anda e `last_scan_at` não finge que varreu; o cartão ainda não avisa.
    assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor, f.conexao?.lastScanAt], [presa.scanFrom, presa.scanCursor, ultimoAvanco]);
    assert.equal(f.conexao?.lastError, null);

    for (const mais of [60, 65, 70]) {
      f.agora = AGORA + mais * MINUTO;
      await rodar(f);
    }
    assert.equal(
      f.conexao?.lastError,
      "A varredura do Bling não avança desde 13/10 às 12:05 (o Bling está lento ou devolvendo erro). As vendas novas continuam chegando pelo aviso.",
    );
    assert.ok(logs.linhas.some((l) => l.includes("loja loja-1: a varredura não avança desde 13/10 às 12:05")), logs.linhas.join("\n"));
    assert.equal(f.conexao?.lastScanAt, ultimoAvanco);
    assert.equal(f.pedidos.has(9001), false, "presa, a varredura não chega na venda nova");

    // 76 h depois do 3002, ele sai da janela (o Bling já parou de retentar o aviso dele) e a passada anda.
    // Token e situações em dia: a passada começa na hora da execução, sem chamada antes dela.
    f.agora = AGORA + 57 * HORA;
    ajustarConexao(f, { accessExpiresAt: iso(f.agora + 5 * HORA), situationsAt: iso(f.agora - HORA) });
    await rodar(f);
  } finally {
    logs.restaurar();
  }
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor], [null, iso(AGORA + 57 * HORA)]);
  assert.ok(f.pedidos.has(9001), "a venda nova entra na fila");
  assert.equal(f.conexao?.lastError, null, "andou: o aviso de parada sai do cartão");
});

test("parada por falta de tempo há mais de 1 h (o minuto do piso não cabe no que sobra da reserva da fila): o cartão e o log avisam", async () => {
  const f = criarBlingFalso();
  // A passada está no piso desde as 10:00 (a última fatia inteira) e o minuto seguinte tem 1000 pedidos:
  // 10 páginas e a vazia, e os 2 s que a reserva da fila deixa num orçamento de 32 s dão umas 6.
  ajustarConexao(f, { lastScanAt: iso(AGORA - 2 * HORA), scanFrom: iso(AGORA - 2 * HORA), scanSliceS: 60, metaEnabled: false });
  f.bling.paginas = listaPorAlteracao(alterados(60_000, 1000, AGORA - 2 * HORA + 1_000, 0));
  const logs = capturarLogs();
  await rodar(f, 32_000).finally(logs.restaurar);

  const [fatia, ...outras] = fatiasLidas(f);
  assert.match(fatia, /^2026-10-13 10:00:00 → 2026-10-13 10:01:00: [1-9]$/);
  assert.deepEqual(outras, []);
  // Interrompida: nada gravado, a próxima execução relê o minuto.
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.lastScanAt, progresso(f)], [iso(AGORA - 2 * HORA), iso(AGORA - 2 * HORA), []]);
  assert.equal(
    f.conexao?.lastError,
    "A varredura do Bling não avança desde 13/10 às 10:00 (o Bling está lento ou devolvendo erro). As vendas novas continuam chegando pelo aviso.",
  );
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1: a varredura não avança desde 13/10 às 10:00")), logs.linhas.join("\n"));
});

test("sem passada em andamento respeita os 4 min; com passada em andamento continua sem esperar", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 3 * MINUTO), scanCursor: iso(AGORA - HORA) });
  await rodar(f);
  assert.deepEqual(fatiasLidas(f), []);

  ajustarConexao(f, { scanFrom: iso(AGORA - 2 * HORA) });
  await rodar(f);
  assert.deepEqual(fatiasLidas(f), ["2026-10-13 10:00:00 → 2026-10-13 12:00:00: 1"]);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor], [null, iso(AGORA)]);
});

test("passada em andamento de mais de 76 h atrás (loja parada dias): recomeça do teto, não de onde parou", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * 24 * HORA), scanFrom: iso(AGORA - 5 * 24 * HORA), scanCursor: iso(AGORA - 6 * 24 * HORA) });
  await rodar(f);
  assert.equal(fatiasLidas(f)[0], "2026-10-10 08:00:00 → 2026-10-10 14:00:00: 1");
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor], [null, iso(AGORA)]);
});

test("orçamento acaba no meio de uma fatia: nada dela é gravado, e a próxima execução a relê inteira, da página 1", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - HORA), metaEnabled: false });
  // 450 pedidos nas últimas 4 h: uma fatia de 5 páginas e a vazia; o orçamento só dá 4.
  const alteradoEm = alterados(7_000, 450, AGORA - 4 * HORA, 20_000);
  f.bling.paginas = listaPorAlteracao(alteradoEm);
  await rodar(f, 31_000);

  assert.deepEqual(fatiasLidas(f), ["2026-10-13 07:00:00 → 2026-10-13 12:00:00: 4"]);
  assert.deepEqual(progresso(f), []);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor, f.conexao?.lastScanAt], [null, iso(AGORA - HORA), iso(AGORA - 5 * MINUTO)]);
  // O que já foi lido está na fila (enfileirar é idempotente); o resto vem na releitura.
  assert.equal(foraDaFila(f, alteradoEm.keys()).length, 50);

  f.agora = AGORA + MINUTO;
  f.bling.chamadas.length = 0;
  await rodar(f);
  assert.deepEqual(fatiasLidas(f), ["2026-10-13 07:00:00 → 2026-10-13 12:01:00: 6"]);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor, foraDaFila(f, alteradoEm.keys())], [null, iso(AGORA + MINUTO), []]);
});

test("fatia acima de 6 h que o orçamento interrompe volta a 6 h: a próxima execução não a tenta inteira de novo", async () => {
  const f = criarBlingFalso();
  // Tamanho guardado de 24 h (uma passada longa que coube) e um orçamento que só dá 4 páginas: as 24 h
  // pedem 10 (900 pedidos e a vazia), e voltariam inteiras a cada execução.
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - 30 * HORA), scanSliceS: 24 * 3600, metaEnabled: false });
  f.bling.paginas = listaPorAlteracao(alterados(10_000, 900, AGORA - 34 * HORA + MINUTO, 95_000));
  await rodar(f, 31_000);

  assert.deepEqual(fatiasLidas(f), ["2026-10-12 02:00:00 → 2026-10-13 02:00:00: 4"]);
  assert.deepEqual([candidatos(f), f.conexao?.scanFrom, progresso(f)], [[6 * 3600], null, []]);
});

test("banco cai no meio de uma fatia: o erro conta e nada da fatia é gravado", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - HORA) });
  f.bling.paginas = listaPorAlteracao(alterados(7_000, 250, AGORA - 3 * HORA, 20_000));
  type Enfileirar = (t: string, origem: "aviso" | "varredura" | "historico", itens: readonly { id: number }[]) => Promise<number>;
  const enfileirar = f.deps.pedidos.enfileirarPedidos as Enfileirar;
  let chamadas = 0;
  const caiNaSegunda: Enfileirar = async (t, origem, itens) => {
    chamadas += 1;
    if (chamadas === 2) throw new Error("banco fora do ar");
    return enfileirar(t, origem, itens);
  };
  f.deps.pedidos.enfileirarPedidos = caiNaSegunda;
  const logs = capturarLogs();
  const r = await rodar(f).finally(logs.restaurar);

  assert.equal(r.falhas, 1);
  assert.deepEqual(progresso(f), []);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.lastScanAt], [null, iso(AGORA - 5 * MINUTO)]);
});

test("item torto da varredura: com id entra pelo aviso (o processamento busca o pedido), sem id só conta; o log leva a loja e as contagens", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO) });
  f.bling.pedidos.set(2002, pedidoDoBling(2002));
  const cliente = { id: 77, nome: "Maria da Silva", numeroDocumento: "123.456.789-00" };
  const pagina = [
    { id: 2001, numero: "2050", data: "2026-10-13", total: 350, contato: { id: 77 }, situacao: { id: 9 } },
    // Sem situação nem total: torto, mas com id.
    { id: 2002, numero: "2051", contato: cliente },
    { id: 0, contato: cliente },
    "x",
  ];
  trocarListagem(f, (q) => (q.get("pagina") === "1" ? json(200, { data: pagina }) : null));
  const logs = capturarLogs();
  const r = await rodar(f).finally(logs.restaurar);

  const [valido, torto] = [f.pedidos.get(2001), f.pedidos.get(2002)];
  assert.deepEqual([valido?.origin, valido?.kind, torto?.origin, torto?.kind], ["varredura", "venda", "aviso", "venda"]);
  assert.equal(chamadasDoBling(f, "/pedidos/vendas/2002").length, 1, "o torto foi buscado inteiro");
  // Só o válido conta como mudança: o aviso marca sempre, e o torto fica horas na janela.
  assert.equal(r.varredura, 1);
  assert.deepEqual(logs.linhas, [
    "[bling/sincronizar] loja loja-1: 3 pedido(s) da página 1 sem id, situação ou total válido; 1 com id na fila pelo aviso",
  ]);
  assert.ok(!logs.linhas.some((l) => /Maria|123\.456/.test(l)), "nada da cliente no log");
});
