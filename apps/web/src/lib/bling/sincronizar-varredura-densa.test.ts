import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  alterados,
  capturarLogs,
  comLatencia,
  criarBlingFalso,
  fatiasLidas,
  foraDaFila,
  HORA,
  iso,
  linhaPendente,
  listaPorAlteracao,
  LOJA,
  MINUTO,
  pedidoDoBling,
  varreduras,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * Bloco denso (alteração em lote no Bling: NF-e em lote, situação em lote, importação de marketplace — ~1000
 * pedidos em 1–3 min), as provas R2-V1 da revisão: o tamanho da fatia fica guardado entre as execuções, o
 * minuto do piso é lido até a página vazia, e a varredura nunca come a reserva da fila.
 */

const cron = (f: BlingFalso, orcamentoMs = 60_000) => sincronizarLoja(LOJA, "cron", orcamentoMs, VIDA.cron, f.deps);

/** `quantos` pedidos (ids a partir de `primeiro`) alterados em `duracaoMs` a partir de `inicio`. */
function bloco(primeiro: number, quantos: number, inicio: number, duracaoMs: number): Map<number, number> {
  return new Map(Array.from({ length: quantos }, (_, i) => [primeiro + i, inicio + Math.floor((i * duracaoMs) / quantos)] as const));
}

/** Loja varrida há 5 min até 1 h atrás: a passada vai de 07:00 (−5 h, com a sobra do fuso) até agora. */
function lojaComBloco(alteradoEm: Map<number, number>): BlingFalso {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - HORA), metaEnabled: false });
  // A venda nova cujo aviso se perdeu, alterada 30 min antes: depois do bloco.
  alteradoEm.set(99_001, AGORA - 30 * MINUTO);
  f.bling.paginas = listaPorAlteracao(alteradoEm);
  return f;
}

test("mais de 1000 pedidos alterados no mesmo minuto (prova R2-V1b): divide até o piso, lê o minuto até a página vazia e fecha a passada", async () => {
  const alteradoEm = alterados(50_000, 1100, AGORA - 5 * HORA + 10_000, 0);
  const f = lojaComBloco(alteradoEm);
  const restaurar = capturarLogs().restaurar;
  const gets: number[] = [];
  try {
    for (let n = 0; n < 2; n += 1) {
      f.agora = AGORA + n * 5 * MINUTO;
      f.bling.chamadas.length = 0;
      await cron(f);
      gets.push(varreduras(f).length);
    }
  } finally {
    restaurar();
  }
  // A 2ª execução começa do tamanho guardado (70 s, a última metade antes de o orçamento acabar), não de 6 h;
  // divide uma vez até o piso e lê o minuto inteiro: 11 páginas e a vazia.
  assert.deepEqual(fatiasLidas(f).slice(0, 2), ["2026-10-13 07:00:00 → 2026-10-13 07:01:10: 10", "2026-10-13 07:00:00 → 2026-10-13 07:01:00: 12"]);
  assert.ok(gets[1] < 40, `GETs por execução: ${gets.join(", ")}`);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.scanCursor, f.conexao?.lastError], [null, iso(AGORA + 5 * MINUTO), null]);
  assert.deepEqual(foraDaFila(f, alteradoEm.keys()), []);
});

test("bloco de 1500 pedidos em 90 s, Bling a 600 ms por página (prova R2-V1a): o tamanho da fatia fica guardado e a varredura passa do bloco", async () => {
  const alteradoEm = bloco(50_000, 1500, AGORA - 4 * HORA, 90_000);
  const f = lojaComBloco(alteradoEm);
  comLatencia(f, 600);
  const restaurar = capturarLogs().restaurar;
  const primeiras: string[] = [];
  let execucoes = 0;
  try {
    for (; execucoes < 12 && f.conexao?.scanCursor === iso(AGORA - HORA); execucoes += 1) {
      f.agora = AGORA + execucoes * 5 * MINUTO;
      f.bling.chamadas.length = 0;
      await cron(f);
      primeiras.push(fatiasLidas(f)[0] ?? "-");
    }
  } finally {
    restaurar();
  }
  // Antes: 12 execuções recomeçando a fatia em 6 h, presa antes do bloco e sem alarme.
  assert.ok(execucoes <= 6, `a passada levou ${execucoes} execuções: ${primeiras.join(" | ")}`);
  // A 2ª execução não recomeça de 6 h: o que já foi dividido vale.
  assert.ok(!primeiras[1].startsWith("2026-10-13 07:00:00 → 2026-10-13 12:"), primeiras[1]);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.lastError], [null, null]);
  assert.deepEqual(foraDaFila(f, alteradoEm.keys()), []);
});

test("cron com bloco denso ainda drena a venda vencida na mesma execução (prova R2-V1c): a varredura para na reserva da fila", async () => {
  const f = lojaComBloco(bloco(50_000, 1500, AGORA - 4 * HORA, 90_000));
  comLatencia(f, 600);
  // Uma venda que falhou antes e voltou para a fila (nova tentativa vencida): sem aviso novo, só o cron a pega.
  f.bling.pedidos.set(7001, pedidoDoBling(7001));
  f.pedidos.set(7001, linhaPendente(7001, { attempts: 1 }));
  const restaurar = capturarLogs().restaurar;
  const r = await cron(f).finally(restaurar);

  const linha = f.pedidos.get(7001);
  assert.deepEqual([linha?.kind, linha?.pending, linha?.orderId !== null && f.girumo.has(linha?.orderId ?? "")], ["venda", false, true]);
  assert.ok(r.processados >= 1);
});

test("página de 14 s começando com 31 s pela frente (prova R3): o prazo da página a aborta sem contar erro nem disjuntor, e a fila drena", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO), scanCursor: iso(AGORA - HORA), metaEnabled: false });
  f.bling.paginas = listaPorAlteracao(alterados(60_000, 3000, AGORA - 4 * HORA, 5_000));
  const tempos = comLatencia(f, 14_000);
  f.bling.pedidos.set(7001, pedidoDoBling(7001));
  f.pedidos.set(7001, linhaPendente(7001, { attempts: 1 }));
  const logs = capturarLogs();
  const r = await cron(f, 59_000).finally(logs.restaurar);

  // Páginas com 59 s, 45 s e 31 s pela frente. A 3ª tem até o fim − 22 s (20 s de uma linha da fila e 2 s de
  // folga): 9 s. Antes ela ia até o fim − 5 s, terminava com 17 s, e nenhuma linha da fila começava.
  assert.deepEqual(tempos, [15_000, 15_000, 9_000]);
  assert.deepEqual([f.pedidos.get(7001)?.kind, f.pedidos.get(7001)?.pending], ["venda", false]);
  assert.deepEqual([r.parou, r.falhas, f.conexao?.consecutiveFailures, f.conexao?.lastError], [undefined, 0, 0, null]);
  // Interrompida por falta de tempo: nada da fatia é gravado, e a próxima execução a relê.
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.lastScanAt], [null, iso(AGORA - 5 * MINUTO)]);
});

test("a reserva da fila é a metade do orçamento quando passa de 30 s: em 2 min, a varredura para com 60 s pela frente", async () => {
  const f = criarBlingFalso();
  // Passada em andamento no piso (10:00), recém-andada: parar aqui não é parada de mais de 1 h.
  ajustarConexao(f, { lastScanAt: iso(AGORA - 2 * MINUTO), scanFrom: iso(AGORA - 2 * HORA), scanSliceS: 60, metaEnabled: false });
  f.bling.paginas = listaPorAlteracao(alterados(60_000, 2000, AGORA - 2 * HORA + 1_000, 0));
  // 5 s por página: começam as páginas com 120 s, 115 s… 65 s pela frente (12), e a 13ª teria 60 s.
  comLatencia(f, 5_000);
  await cron(f, 120_000);

  assert.deepEqual(fatiasLidas(f), ["2026-10-13 10:00:00 → 2026-10-13 10:01:00: 12"]);
  assert.deepEqual([f.conexao?.scanFrom, f.conexao?.lastScanAt, f.conexao?.lastError], [iso(AGORA - 2 * HORA), iso(AGORA - 2 * MINUTO), null]);
});
