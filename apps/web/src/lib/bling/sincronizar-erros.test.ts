import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  avisar,
  capturarLogs,
  criarBlingFalso,
  HORA,
  iso,
  json,
  linhaPendente,
  LOJA,
  MINUTO,
  pedidoDoBling,
  pendentes,
  semLog,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { ErroBling } from "./cliente";
import { sincronizarLoja, type Gatilho } from "./sincronizar";
import { comoParada } from "./sincronizar-execucao";

/**
 * O motor quando algo dá errado (spec §3 "Cliente HTTP"): escopo, cota do dia, disjuntor, teto de
 * erros, o rastro no log e no cartão, varredura e histórico que falham sem segurar a fila, e a nova
 * tentativa do pedido. O token está em `sincronizar-token.test.ts`; o caminho normal, em
 * `sincronizar.test.ts`.
 */

function rodar(f: BlingFalso, gatilho: Gatilho = "cron") {
  return sincronizarLoja(LOJA, gatilho, 60_000, VIDA[gatilho], f.deps);
}

function comPedidos(f: BlingFalso, ...ids: number[]): void {
  for (const id of ids) {
    f.bling.pedidos.set(id, pedidoDoBling(id));
    f.pedidos.set(id, linhaPendente(id));
  }
}

function falhaNoPedido(f: BlingFalso, vezes: number, resposta: () => Response): void {
  f.bling.forcadas.push({ caminho: /^\/pedidos\/vendas\/\d+$/, vezes, resposta });
}

const linha = (f: BlingFalso, id: number) => f.pedidos.get(id);
const invalido = () => json(400, { error: { type: "VALIDATION_ERROR", message: "Requisição inválida" } });

test("403 do Bling (falta escopo no app): para a loja com o erro no cartão", async () => {
  const f = criarBlingFalso();
  falhaNoPedido(f, 1, () => json(403, { error: { type: "FORBIDDEN", message: "Sem permissão" } }));
  comPedidos(f, 1001, 1002);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.equal(r.parou, "escopo");
  assert.deepEqual([f.conexao?.status, f.conexao?.lastError], ["ativa", "O app do Bling está sem permissão para ler pedidos ou contatos."]);
  assert.deepEqual([linha(f, 1001)?.attempts, linha(f, 1002)?.attempts, linha(f, 1002)?.pending], [1, 0, true]);
});

test("429 da cota do dia: pausa a loja por 1 h sem contar no disjuntor", async () => {
  const f = criarBlingFalso();
  falhaNoPedido(f, 1, () => json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite", period: "day" } }));
  comPedidos(f, 1001);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.equal(r.parou, "pausa");
  assert.deepEqual([f.conexao?.pausedUntil, f.conexao?.consecutiveFailures], [iso(f.agora + HORA), 0]);
  assert.deepEqual([f.conexao?.lastError, f.conexao?.lastErrorAt], ["Bling: cota do dia atingido em /pedidos/vendas/1001", iso(f.agora)]);
});

test("5 falhas transitórias seguidas: disjuntor pausa 15 min × 2^quedas e soma uma queda", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { consecutiveFailures: 1 });
  const ids = [7001, 7002, 7003, 7004, 7005, 7006];
  comPedidos(f, ...ids);
  falhaNoPedido(f, Number.POSITIVE_INFINITY, () => json(503, { error: "fora do ar" }));
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.equal(r.parou, "pausa");
  assert.deepEqual([f.conexao?.consecutiveFailures, f.conexao?.pausedUntil], [2, iso(f.agora + 30 * MINUTO)]);
  assert.deepEqual(ids.map((id) => linha(f, id)?.attempts), [1, 1, 1, 1, 1, 0]);
  assert.equal(r.falhas, 5);
  // Mutante: pausar sem a mensagem deixava o cartão com "pausada" e nenhum porquê.
  assert.deepEqual([f.conexao?.lastError, f.conexao?.lastErrorAt], ["Bling: HTTP 503 em /pedidos/vendas/7005", iso(f.agora)]);
});

test("sucesso depois de uma queda zera as falhas seguidas da loja", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { consecutiveFailures: 2 });
  comPedidos(f, 1001);
  await rodar(f);
  assert.equal(f.conexao?.consecutiveFailures, 0);
});

test("mais de 20 erros na execução: para (longe dos 300 erros em 10 s que bloqueiam o IP)", async () => {
  const f = criarBlingFalso();
  comPedidos(f, ...Array.from({ length: 25 }, (_, i) => 8000 + i));
  falhaNoPedido(f, Number.POSITIVE_INFINITY, invalido);
  const logs = capturarLogs();
  const r = await rodar(f, "aviso").finally(logs.restaurar);

  assert.deepEqual([r.parou, r.falhas], ["erros", 21]);
  assert.equal(pendentes(f).filter((l) => l.attempts === 0).length, 4);
  // O cartão mostra por um tempo quantos foram e o último. Mutante: a execução parava calada.
  assert.equal(
    f.conexao?.lastError,
    "21 erro(s) nesta sincronização; o último: Bling recusou /pedidos/vendas/8020: HTTP 400 — VALIDATION_ERROR: Requisição inválida",
  );
  assert.equal(f.conexao?.lastErrorAt, iso(f.agora));
  // Toda linha leva a loja; a de um pedido, o pedido. Uma linha só de resumo da execução.
  assert.ok(logs.linhas.length > 0 && logs.linhas.every((l) => l.includes("loja loja-1")), logs.linhas.join("\n"));
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1 pedido 8000:")));
  assert.deepEqual(
    logs.linhas.filter((l) => l.includes("gatilho")),
    ["[bling/sincronizar] loja loja-1: gatilho aviso, parou erros, 21 falha(s), 0 processado(s)"],
  );
});

test("execução sem falha e com parada de rotina (orçamento): nenhuma linha de log", async () => {
  const f = criarBlingFalso();
  comPedidos(f, ...Array.from({ length: 30 }, (_, i) => 6000 + i));
  const logs = capturarLogs();
  const r = await sincronizarLoja(LOJA, "aviso", 12_000, VIDA.aviso, f.deps).finally(logs.restaurar);

  assert.equal(r.parou, "orcamento");
  assert.deepEqual(logs.linhas, []);
});

test("varredura com erro do banco conta a falha, mas a fila drena mesmo assim", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { lastScanAt: iso(AGORA - 5 * MINUTO) });
  f.bling.paginas = (q) => (q.get("pagina") === "1" ? [pedidoDoBling(2001)] : []);
  comPedidos(f, 1001);
  f.deps.pedidos.enfileirarPedidos = async () => {
    throw new Error("banco fora do ar");
  };
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  // Mutante: o erro subia, derrubava a rodada, e a venda do aviso esperava a varredura voltar.
  assert.deepEqual([r.processados, r.falhas, r.parou], [1, 1, undefined]);
  assert.equal(linha(f, 1001)?.pending, false);
});

test("histórico com erro do banco conta a falha, mas a fila drena mesmo assim", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { backfillDoneAt: null });
  comPedidos(f, 1001);
  f.deps.pedidos.contarPendentes = async () => {
    throw new Error("banco fora do ar");
  };
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual([r.processados, r.falhas, r.parou], [1, 1, undefined]);
  assert.equal(linha(f, 1001)?.pending, false);
});

test("Meta que responde tarde e o banco cai logo depois: o status grava até o fim da trava, e a volta seguinte não reenvia", async () => {
  const f = criarBlingFalso();
  comPedidos(f, 1001);
  // O Bling segura o pedido e o contato (429 três vezes cada: 7 s) e o Meta leva 7,65 s: ele responde a 3 s do fim.
  const limite = () => json(429, { error: { type: "TOO_MANY_REQUESTS", period: "second" } });
  for (const caminho of [/^\/pedidos\/vendas\/\d+$/, /^\/contatos\/\d+$/]) f.bling.forcadas.push({ caminho, vezes: 3, resposta: limite });
  const enviar = f.deps.meta.enviar;
  f.deps.meta.enviar = async (a) => {
    f.agora += 7_650;
    return enviar(a);
  };
  const salvar = f.deps.pedidos.salvarEfeitos;
  f.deps.pedidos.salvarEfeitos = async (...args) => {
    if (f.agora >= AGORA + 20_000 && f.agora < AGORA + 25_500) throw new Error("supabase 503 (blip)");
    return salvar(...args);
  };
  const restaurar = semLog();
  await sincronizarLoja(LOJA, "aviso", 25_000, VIDA.aviso, f.deps).finally(restaurar);
  // Mutante: com o fim do orçamento como teto, a gravação desistia antes do banco voltar.
  assert.deepEqual([linha(f, 1001)?.icStatus, linha(f, 1001)?.purchaseStatus], ["enviado", "enviado"]);

  f.agora += MINUTO;
  avisar(f, 1001);
  await rodar(f, "aviso");
  assert.equal(f.meta.enviados.length, 1);
});

test("rede das listas que falha: o log diz a loja e o cartão mostra o motivo", async () => {
  const f = criarBlingFalso();
  comPedidos(f, 1001);
  const recalcular = f.deps.contatos.recalcularListas;
  f.deps.contatos.recalcularListas = async (t, contato) => {
    if (contato === undefined) throw new Error("canceling statement due to statement timeout");
    return recalcular(t, contato);
  };
  const logs = capturarLogs();
  await rodar(f).finally(logs.restaurar);

  // Mutante: só o log, e as listas da loja ficavam velhas sem ninguém ver no cartão.
  assert.deepEqual([f.conexao?.lastError, f.conexao?.lastErrorAt], ["Listas: canceling statement due to statement timeout", iso(f.agora)]);
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1") && l.includes("statement timeout")), logs.linhas.join("\n"));
});

test("prazo da execução vem no campo do erro: vira parada de orçamento; a mensagem sozinha não decide", () => {
  // O abort do timeout que o prazo encolheu não precisa dizer "prazo" na mensagem.
  const prazo = new ErroBling("transitorio", null, "Bling: sem resposta em /pedidos/vendas/1", { prazoEsgotado: true });
  assert.equal(comoParada(prazo)?.motivo, "orcamento");
  // Mutante: a regex antiga na mensagem — e o que só cita "prazo" não é o orçamento acabando.
  const soMensagem = new ErroBling("transitorio", null, "Bling: prazo da execução esgotado antes de /x");
  assert.equal(comoParada(soMensagem), null);
});

test("pedido que falha enquanto um aviso o reabre: a nova tentativa não apaga o aviso e ele volta na hora", async () => {
  const f = criarBlingFalso();
  comPedidos(f, 1001);
  falhaNoPedido(f, 1, () => {
    avisar(f, 1001);
    return invalido();
  });
  const restaurar = semLog();
  const r = await rodar(f, "aviso").finally(restaurar);

  assert.ok(f.trilha.includes("pedidos.agendarNovaTentativa 1001 false"));
  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.kind, linha(f, 1001)?.attempts, linha(f, 1001)?.lastError], [false, "venda", 0, null]);
  assert.deepEqual([r.processados, r.falhas], [1, 1]);
});

test("6ª falha do mesmo pedido: sai da fila com o erro guardado", async () => {
  const f = criarBlingFalso();
  comPedidos(f, 1001);
  f.pedidos.set(1001, linhaPendente(1001, { attempts: 5 }));
  falhaNoPedido(f, Number.POSITIVE_INFINITY, invalido);
  const restaurar = semLog();
  const r = await rodar(f, "aviso").finally(restaurar);

  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.attempts], [false, 6]);
  assert.match(linha(f, 1001)?.lastError ?? "", /HTTP 400/);
  assert.equal(r.parou, undefined);
});

test("banco fora do ar no meio: a execução não lança, conta o erro, solta a trava e deixa o erro no cartão", async () => {
  const f = criarBlingFalso();
  comPedidos(f, 1001);
  f.deps.pedidos.listarPendentes = async () => {
    throw new Error("banco fora do ar");
  };
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual([r.parou, r.falhas, f.trava], ["erros", 1, null]);
  assert.equal(f.conexao?.lastError, "1 erro(s) nesta sincronização; o último: banco fora do ar");
});
