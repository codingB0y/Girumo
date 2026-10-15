import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  capturarLogs,
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
 * A válvula do histórico com o Bling caindo (spec §3 "Histórico"). A falha da página da frente só conta quando outra
 * listagem respondeu na mesma execução (a varredura ou a relida): uma queda total nunca arma a válvula. A seguinte que
 * também falha (é o Bling ou a consulta, não a página) zera a conta. Provas R3 (a queda pulava a relida e a frente) e
 * R4 (a conta da queda ficava, e uma falha da frente na volta pulava uma página boa).
 */

const PAGINAS = 8;
const FORA = () => json(503, { error: { type: "SERVER_ERROR" } });
const RECUSADA = () => json(400, { error: { type: "VALIDATION_ERROR", message: "Requisição inválida" } });
const PARADA = (pagina: number) =>
  `Importação do histórico parada na página ${pagina} (o Bling devolve erro para ela e para a seguinte). As vendas novas continuam chegando. A Girumo tenta de novo sozinha.`;

/** O que a listagem devolve no lugar da resposta normal (null = a normal). */
type Erro = (q: URLSearchParams) => Response | null;
type Loja = { f: BlingFalso; ids: number[]; erro: Erro };

const doHistorico = (q: URLSearchParams) => q.has("dataInicial");
const daPagina = (ids: readonly number[], pagina: number) => ids.slice((pagina - 1) * 100, pagina * 100);
const pulos = (logs: readonly string[]) => logs.filter((l) => l.includes("pulou"));

/**
 * Loja no meio de um histórico de 8 páginas de 100, com as de antes de `frente` já importadas, varrida há 5 min (a
 * varredura roda em toda execução). O erro da listagem é o que `crons` põe antes de cada execução.
 */
function lojaNoHistorico(frente: number): Loja {
  const f = criarBlingFalso();
  const varrida = iso(AGORA - 5 * MINUTO);
  ajustarConexao(f, { backfillDoneAt: null, backfillPage: frente, lastScanAt: varrida, scanCursor: varrida, metaEnabled: false });
  const ids = Array.from({ length: PAGINAS * 100 }, (_, i) => 40_000 + i);
  const pedido = (id: number) => pedidoDoBling(id, { data: "2026-08-01" });
  f.bling.paginas = (q) => (doHistorico(q) ? daPagina(ids, Number(q.get("pagina"))).map(pedido) : []);
  for (const id of ids.slice(0, (frente - 1) * 100)) {
    f.pedidos.set(id, linhaPendente(id, { origin: "historico", pending: false, kind: "venda", snapshot: pedido(id) }));
  }
  const loja: Loja = { f, ids, erro: () => null };
  trocarListagem(f, (q) => loja.erro(q));
  return loja;
}

/**
 * Um cron a cada 5 min, até `vezes` ou o histórico terminar; antes da n-ésima execução, `erroDa(n)` vira o erro da
 * listagem. Devolve o log e a conta da frente (`backfill_fails`) depois de cada execução.
 */
async function crons(loja: Loja, vezes: number, erroDa: (n: number) => Erro): Promise<{ logs: string[]; contas: number[] }> {
  const { f } = loja;
  const logs = capturarLogs();
  const contas: number[] = [];
  try {
    for (let n = 0; n < vezes && !f.conexao?.backfillDoneAt; n += 1) {
      loja.erro = erroDa(n);
      await sincronizarLoja(LOJA, "cron", 150_000, VIDA.cron, f.deps);
      contas.push(f.conexao?.backfillFails ?? Number.NaN);
      f.agora += 5 * MINUTO;
    }
  } finally {
    logs.restaurar();
  }
  return { logs: logs.linhas, contas };
}

const QUEDAS = [
  { frente: 5, execucoes: 24, quanto: "2 h fora no meio do histórico" },
  { frente: 1, execucoes: 12, quanto: "1 h fora no começo do histórico (página 1, sem relida)" },
];

for (const { frente, execucoes, quanto } of QUEDAS) {
  test(`listagem do Bling ${quanto}, e na volta a página da frente falha uma vez (provas R3 e R4): a queda não conta, nada é pulado e nenhum pedido se perde`, async () => {
    const loja = lojaNoHistorico(frente);
    const daFrente = (q: URLSearchParams) => doHistorico(q) && q.get("pagina") === String(frente);
    const { logs, contas } = await crons(loja, execucoes + 12, (n) => (q) => (n < execucoes || (n === execucoes && daFrente(q)) ? FORA() : null));

    assert.ok(loja.f.conexao?.backfillDoneAt, "o histórico terminou");
    // Mutante (a prova R4): cada execução da queda contava uma falha; na volta, a da frente passava de 12, a seguinte
    // respondia e a página (boa) era pulada com os 100 pedidos dela.
    assert.deepEqual(contas.slice(0, execucoes + 1), [...Array<number>(execucoes).fill(0), 1]);
    assert.deepEqual(pulos(logs), []);
    assert.deepEqual(foraDaFila(loja.f, loja.ids), []);
  });
}

test("consulta do histórico fora por 1 h com a varredura respondendo: conta, a seguinte também falha e a conta zera; uma falha da frente na volta não pula a página", async () => {
  const loja = lojaNoHistorico(5);
  const queda = await crons(loja, 12, () => (q) => (doHistorico(q) ? FORA() : null));
  // A varredura respondeu: cada falha da frente conta. Na 12ª a seguinte falha também: nada é pulado e a conta zera.
  assert.deepEqual(queda.contas, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]);
  assert.deepEqual([loja.f.conexao?.backfillPage, loja.f.conexao?.lastError], [5, PARADA(5)]);

  // A consulta volta instável: a página da frente falha mais uma vez antes de andar.
  const volta = await crons(loja, 12, (n) => (q) => (n === 0 && doHistorico(q) && q.get("pagina") === "5" ? FORA() : null));
  // Mutante (a parada sem zerar): a 13ª falha tentava a seguinte, que respondia, e a página 5 (boa) era pulada.
  assert.equal(volta.contas[0], 1);
  assert.ok(loja.f.conexao?.backfillDoneAt, "o histórico terminou");
  assert.deepEqual(pulos([...queda.logs, ...volta.logs]), []);
  assert.deepEqual(foraDaFila(loja.f, loja.ids), []);
});

test("página da frente quebrada de verdade, só com a varredura (página 1, sem relida) ou só com a relida (varredura fora) respondendo: conta, e na 12ª a seguinte responde e ela é pulada", async () => {
  const casos: { frente: number; erro: Erro; quem: string }[] = [
    { frente: 1, erro: (q) => (doHistorico(q) && q.get("pagina") === "1" ? RECUSADA() : null), quem: "só a varredura" },
    { frente: 5, erro: (q) => (!doHistorico(q) ? FORA() : q.get("pagina") === "5" ? RECUSADA() : null), quem: "só a relida" },
  ];
  for (const { frente, erro, quem } of casos) {
    const loja = lojaNoHistorico(frente);
    const { logs, contas } = await crons(loja, 24, () => erro);

    assert.deepEqual(contas.slice(0, 12), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0], quem);
    assert.deepEqual(pulos(logs), [`[bling/sincronizar] loja loja-1: importação do histórico pulou a página ${frente} depois de 12 tentativas`], quem);
    assert.ok(loja.f.conexao?.backfillDoneAt, quem);
    // Só a página quebrada se perde.
    assert.deepEqual(foraDaFila(loja.f, loja.ids), daPagina(loja.ids, frente), quem);
  }
});
