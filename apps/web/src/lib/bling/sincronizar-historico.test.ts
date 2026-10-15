import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  capturarLogs,
  chamadasDoBling,
  comLatencia,
  criarBlingFalso,
  foraDaFila,
  iso,
  json,
  linhaPendente,
  LOJA,
  MINUTO,
  pedidoDoBling,
  trocarListagem,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * A importação do histórico de 90 dias (spec §3 "Histórico") contra o mundo falso: relê a página anterior
 * a cada execução (a relida que falha não impede a frente), item torto entra pelo aviso, a página que falha
 * vai para o cartão e, na 12ª falha seguida da página da frente, a seguinte decide: respondeu → a da frente
 * é pulada (a válvula); falhou também → nada é pulado (é o Bling ou a consulta), a conta zera e o cartão
 * avisa; o aviso sai quando a frente anda. Nunca começa página com menos que a reserva da fila pela frente, e a
 * página lenta para no prazo dela. A válvula com o Bling caindo está em `sincronizar-historico-queda.test.ts`.
 */

function rodar(f: BlingFalso, orcamentoMs = 60_000) {
  return sincronizarLoja(LOJA, "cron", orcamentoMs, VIDA.cron, f.deps);
}

const RECUSADA = () => json(400, { error: { type: "VALIDATION_ERROR", message: "Requisição inválida" } });
const PARADA = (pagina: number) =>
  `Importação do histórico parada na página ${pagina} (o Bling devolve erro para ela e para a seguinte). As vendas novas continuam chegando. A Girumo tenta de novo sozinha.`;

/** O histórico do Bling: `paginas` páginas de 100 pedidos (ids a partir de 40000) e a vazia depois delas. */
function historico(f: BlingFalso, paginas: number): number[] {
  const ids = Array.from({ length: paginas * 100 }, (_, i) => 40_000 + i);
  f.bling.paginas = (q) => {
    if (!q.has("dataInicial")) return [];
    const pagina = Number(q.get("pagina"));
    return ids.slice((pagina - 1) * 100, pagina * 100).map((id) => pedidoDoBling(id, { data: "2026-08-01" }));
  };
  return ids;
}

const daPagina = (ids: readonly number[], pagina: number) => ids.slice((pagina - 1) * 100, pagina * 100);
/** As páginas do histórico pedidas ao Bling desde a última limpeza das chamadas. */
const paginasLidas = (f: BlingFalso) =>
  chamadasDoBling(f, "/pedidos/vendas").filter((c) => c.query.has("dataInicial")).map((c) => Number(c.query.get("pagina")));

/** Uma execução de cron a cada 5 min, `n` vezes. */
async function crons(f: BlingFalso, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await rodar(f);
    f.agora += 5 * MINUTO;
  }
}

test("item torto do histórico também entra pelo aviso", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1 });
  f.bling.pedidos.set(4002, pedidoDoBling(4002, { data: "2026-08-01" }));
  trocarListagem(f, (q) => (q.has("dataInicial") && q.get("pagina") === "1" ? json(200, { data: [{ id: 4002, total: "R$ 10" }] }) : null));
  const restaurar = capturarLogs().restaurar;
  await rodar(f).finally(restaurar);

  assert.deepEqual([f.pedidos.get(4002)?.origin, f.pedidos.get(4002)?.lowPriority, f.pedidos.get(4002)?.kind], ["aviso", false, "venda"]);
  assert.ok(f.conexao?.backfillDoneAt);
});

test("histórico relê a página anterior a cada execução: pedido apagado no Bling entre execuções não faz ninguém pular", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1, metaEnabled: false });
  let lista = Array.from({ length: 500 }, (_, i) => 40_000 + i);
  const ids = [...lista];
  f.bling.paginas = (q) => {
    if (!q.has("dataInicial")) return [];
    const pagina = Number(q.get("pagina"));
    return lista.slice((pagina - 1) * 100, pagina * 100).map((id) => pedidoDoBling(id, { data: "2026-08-01" }));
  };
  const paginas: number[][] = [];
  for (let execucao = 0; execucao < 3; execucao += 1) {
    f.bling.chamadas.length = 0;
    await rodar(f, 150_000);
    paginas.push(paginasLidas(f));
    // Depois da primeira: 5 pedidos da página 1 apagados no Bling puxam a lista 5 posições para trás.
    if (execucao === 0) lista = lista.slice(5);
    f.agora += 5 * MINUTO;
  }

  assert.deepEqual(paginas, [[1, 2, 3], [3, 4, 5], [5, 6]]);
  assert.ok(f.conexao?.backfillDoneAt);
  // Sem reler, os que eram 301..305 caíam na página 3, já lida, e nunca entravam.
  assert.deepEqual(foraDaFila(f, ids), []);
});

test("página do histórico que falha: conta o erro, o cartão diz em que página a importação parou e a falha fica contada", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1 });
  f.bling.paginas = (q) => (q.has("dataInicial") && q.get("pagina") === "1" ? [pedidoDoBling(4001, { data: "2026-08-01" })] : []);
  trocarListagem(f, (q) => (q.has("dataInicial") && q.get("pagina") === "2" ? RECUSADA() : null));
  const restaurar = capturarLogs().restaurar;
  const r = await rodar(f).finally(restaurar);

  assert.equal(r.falhas, 1);
  assert.equal(
    f.conexao?.lastError,
    "Importação do histórico parou na página 2: Bling recusou /pedidos/vendas: HTTP 400 — VALIDATION_ERROR: Requisição inválida",
  );
  assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails, f.conexao?.backfillDoneAt], [2, 1, null]);
});

test("página da frente quebrada com a seguinte boa: na 12ª falha seguida a seguinte responde, a da frente é pulada com aviso no cartão e no log, e o histórico segue", async () => {
  const logs = capturarLogs();
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1, metaEnabled: false });
  const ids = historico(f, 4);
  trocarListagem(f, (q) => (q.has("dataInicial") && q.get("pagina") === "2" ? RECUSADA() : null));
  try {
    // A página 1 lida (e relida a cada execução) não conta como sucesso da página da frente.
    await crons(f, 11);
    assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails], [2, 11]);
    assert.match(f.conexao?.lastError ?? "", /^Importação do histórico parou na página 2: /);

    // A 12ª: a 3 responde, então a 2 está quebrada mesmo. O que a 3 trouxe já entra na fila.
    f.bling.chamadas.length = 0;
    await crons(f, 1);
    assert.deepEqual(paginasLidas(f), [1, 2, 3]);
    assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails, f.conexao?.backfillDoneAt], [4, 0, null]);
    assert.deepEqual(foraDaFila(f, daPagina(ids, 3)), []);
    assert.equal(f.conexao?.lastError, "Importação do histórico pulou a página 2 depois de 12 tentativas");
    assert.ok(logs.linhas.some((l) => l.includes("loja loja-1: importação do histórico pulou a página 2 depois de 12 tentativas")), logs.linhas.join("\n"));

    // A execução seguinte relê a 3 (não a pulada) e termina.
    f.bling.chamadas.length = 0;
    await crons(f, 1);
    assert.deepEqual(paginasLidas(f), [3, 4, 5]);
  } finally {
    logs.restaurar();
  }
  assert.ok(f.conexao?.backfillDoneAt);
  // Só a página 2 se perdeu.
  assert.deepEqual(foraDaFila(f, ids), daPagina(ids, 2));
});

test("página relida que falha não conta nem impede: a frente segue na mesma execução e nada se perde", async () => {
  const f = criarBlingFalso();
  // Páginas 1 a 3 já importadas: cada execução relê a 3 antes da 4.
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 4, metaEnabled: false });
  const ids = historico(f, 5);
  trocarListagem(f, (q) => (q.has("dataInicial") && q.get("pagina") === "3" ? RECUSADA() : null));
  const restaurar = capturarLogs().restaurar;
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual(paginasLidas(f), [3, 4, 5]);
  // O erro conta na execução, mas não na válvula nem no cartão: a página relida já tinha sido lida.
  assert.deepEqual([r.falhas, f.conexao?.backfillPage, f.conexao?.backfillFails, f.conexao?.lastError], [1, 6, 0, null]);
  assert.deepEqual(foraDaFila(f, [...daPagina(ids, 4), ...daPagina(ids, 5)]), []);
});

test("consulta do histórico que falha sempre (a seguinte também falha): nada é pulado, o cartão avisa, a conta zera e recomeça, e o log leva a loja", async () => {
  const logs = capturarLogs();
  const f = criarBlingFalso();
  // Varrida há 5 min: a varredura responde em toda execução, então cada falha da frente conta.
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 3, lastScanAt: iso(AGORA - 5 * MINUTO), metaEnabled: false });
  historico(f, 4);
  trocarListagem(f, (q) => (q.has("dataInicial") ? RECUSADA() : null));
  try {
    await crons(f, 11);
    assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails], [3, 11]);

    // A 12ª tenta a seguinte antes de pular: falhou também, então não pula, e a conta (que era do Bling) zera.
    f.bling.chamadas.length = 0;
    await crons(f, 1);
    assert.deepEqual(paginasLidas(f), [2, 3, 4]);
    assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails, f.conexao?.lastError], [3, 0, PARADA(3)]);

    // Recomeça do zero: só a 12ª falha seguinte tenta a seguinte de novo.
    f.bling.chamadas.length = 0;
    await crons(f, 11);
    assert.ok(!paginasLidas(f).includes(4), String(paginasLidas(f)));
    await crons(f, 1);
  } finally {
    logs.restaurar();
  }
  assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails, f.conexao?.backfillDoneAt, f.conexao?.lastError], [3, 0, null, PARADA(3)]);
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1: importação do histórico parada na página 3")), logs.linhas.join("\n"));
  assert.ok(!logs.linhas.some((l) => l.includes("pulou")), logs.linhas.join("\n"));
});

test("o sucesso da página da frente zera as falhas: 11 falhas, a página anda, e a falha seguinte é a primeira de novo", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1, metaEnabled: false });
  historico(f, 4);
  let quebrada = 2;
  trocarListagem(f, (q) => (q.has("dataInicial") && Number(q.get("pagina")) === quebrada ? RECUSADA() : null));
  const restaurar = capturarLogs().restaurar;
  try {
    await crons(f, 11);
    assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails], [2, 11]);
    // O Bling volta a servir a 2 e quebra a 3.
    quebrada = 3;
    await crons(f, 1);
  } finally {
    restaurar();
  }
  assert.deepEqual([f.conexao?.backfillPage, f.conexao?.backfillFails], [3, 1]);
  assert.match(f.conexao?.lastError ?? "", /^Importação do histórico parou na página 3: /);
});

test("o aviso de histórico parado (a frente falhou, ou ela e a seguinte) sai do cartão quando a página da frente anda; o de página pulada e outro erro ficam", async () => {
  const avisos = ["Importação do histórico parou na página 3: Bling fora", PARADA(3)];
  const outros = ["Importação do histórico pulou a página 2 depois de 12 tentativas", "O app do Bling está sem permissão para ler pedidos ou contatos."];
  const antes = iso(AGORA - MINUTO);
  for (const lastError of [...avisos, ...outros]) {
    const f = criarBlingFalso();
    ajustarConexao(f, { backfillDoneAt: null, backfillPage: 3, lastError, lastErrorAt: antes, metaEnabled: false });
    historico(f, 5);
    await rodar(f);
    // Mutante: o aviso ficava o dia inteiro dizendo que a importação parou, com ela andando.
    const sai = avisos.includes(lastError);
    assert.deepEqual([f.conexao?.backfillPage, f.conexao?.lastError, f.conexao?.lastErrorAt], [5, sai ? null : lastError, sai ? null : antes], lastError);
  }
});

test("página do histórico de 14 s começando com 31 s pela frente: para no prazo dela sem contar falha (nem na válvula), e a venda vencida drena", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1, metaEnabled: false });
  historico(f, 4);
  const tempos = comLatencia(f, 14_000);
  f.bling.pedidos.set(7001, pedidoDoBling(7001));
  f.pedidos.set(7001, linhaPendente(7001, { attempts: 1 }));
  const r = await rodar(f, 59_000);

  // A 3ª página tem até o fim − 22 s: 9 s. Abortada nele, é falta de tempo, não página que falhou.
  assert.deepEqual([paginasLidas(f), tempos], [[1, 2, 3], [15_000, 15_000, 9_000]]);
  assert.deepEqual([r.parou, r.falhas, f.conexao?.backfillPage, f.conexao?.backfillFails, f.conexao?.lastError], [undefined, 0, 3, 0, null]);
  assert.deepEqual([f.pedidos.get(7001)?.kind, f.pedidos.get(7001)?.pending], ["venda", false]);
});

test("histórico só começa página com mais que a reserva da fila pela frente (30 s, mesmo num orçamento de 40 s), e a venda vencida drena", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: 1, metaEnabled: false });
  historico(f, 4);
  // O Bling lento: 6 s por página. Páginas 1 (40 s pela frente) e 2 (34 s); a 3 começaria com 28 s.
  comLatencia(f, 6_000);
  f.bling.pedidos.set(7001, pedidoDoBling(7001));
  f.pedidos.set(7001, linhaPendente(7001, { attempts: 1 }));
  await rodar(f, 40_000);

  assert.deepEqual(paginasLidas(f), [1, 2]);
  assert.deepEqual([f.conexao?.backfillPage, f.pedidos.get(7001)?.kind, f.pedidos.get(7001)?.pending], [3, "venda", false]);
});
