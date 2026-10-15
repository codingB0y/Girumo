import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  avisar,
  capturarLogs,
  chamadasDoBling,
  criarBlingFalso,
  iso,
  json,
  linhaPendente,
  LOJA,
  MINUTO,
  pedidoDoBling,
  semLog,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * A renovação que não pode, ou não deve, acontecer agora (spec §3 "Token"): o limite global de
 * /oauth/token (10/min, todas as lojas) e o recuo de 5 min depois de uma falha (`token_retry_at`). O
 * token que ainda serve segue; o que vence, ou o que o Bling acabou de recusar (401), para a loja sem
 * marcar reconectar, com o motivo no cartão. O par em si está em `sincronizar-token.test.ts`; a vida
 * da função (a renovação que não cabe nem começa), em `sincronizar-prazo.test.ts`.
 */

function rodar(f: BlingFalso) {
  return sincronizarLoja(LOJA, "cron", 60_000, VIDA.cron, f.deps);
}

function comPedidos(f: BlingFalso, ...ids: number[]): void {
  for (const id of ids) {
    f.bling.pedidos.set(id, pedidoDoBling(id));
    f.pedidos.set(id, linhaPendente(id));
  }
}

const trocasDeToken = (f: BlingFalso) => chamadasDoBling(f, "/oauth/token").length;
const linha = (f: BlingFalso, id: number) => f.pedidos.get(id);
/**
 * O cartão quando a renovação é barrada (limite global ou recuo) e o token não serve. Não culpa ninguém: o
 * recuo vem de uma falha do Bling, não de um limite da Girumo.
 */
const BARRADA = "O acesso ao Bling não pôde ser renovado agora. A Girumo tenta de novo sozinha.";
/** O cartão quando o /oauth/token falha sem ser recusa (Bling fora): o tipo do erro entre parênteses. */
const FALHOU = "Não foi possível renovar o acesso ao Bling (transitorio).";
const noCartao = (f: BlingFalso) => [f.conexao?.lastError ?? null, f.conexao?.lastErrorAt ?? null];

test("renovação que falha sem ser recusa (Bling fora): token_retry_at em 5 min e o motivo no cartão; o token que ainda vale segue", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  f.bling.oauth = () => json(503, { error: "fora do ar" });
  comPedidos(f, 1001);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual([r.parou, r.processados, f.conexao?.status], [undefined, 1, "ativa"]);
  assert.equal(f.conexao?.tokenRetryAt, iso(AGORA + 5 * MINUTO));
  assert.deepEqual([f.conexao?.lastError, f.conexao?.lastErrorAt], [FALHOU, iso(AGORA)]);
});

test("renovação que falha com o token valendo: o aviso dela fica no cartão mesmo com a varredura e o histórico andando na mesma execução", async () => {
  // O que estava no cartão antes: a varredura e o histórico tiram o aviso deles quando voltam a andar.
  const antes = ["A varredura do Bling não avança desde 13/10 às 10:00 (o Bling está lento ou devolvendo erro).", "Importação do histórico parou na página 1: Bling fora"];
  for (const lastError of antes) {
    const f = criarBlingFalso();
    const varrida = iso(AGORA - 5 * MINUTO);
    ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO), lastError, lastErrorAt: varrida, lastScanAt: varrida, backfillDoneAt: null, backfillPage: 1 });
    f.bling.oauth = () => json(503, { error: "fora do ar" });
    f.bling.paginas = (q) => (q.has("dataInicial") && q.get("pagina") === "1" ? [pedidoDoBling(4001, { data: "2026-08-01" })] : []);
    const restaurar = semLog();
    await rodar(f).finally(restaurar);
    // Mutante (a memória da rodada com o aviso de antes): andar tirava do cartão o aviso da renovação, gravado depois.
    assert.deepEqual([Boolean(f.conexao?.backfillDoneAt), f.conexao?.lastScanAt !== varrida, ...noCartao(f)], [true, true, FALHOU, iso(AGORA)], lastError);
  }
});

test("token_retry_at no futuro: nem /oauth/token nem o balde global; o token que ainda serve segue, o que vence para a loja", async () => {
  const valendo = criarBlingFalso();
  ajustarConexao(valendo, { accessExpiresAt: iso(AGORA + 10 * MINUTO), tokenRetryAt: iso(AGORA + 2 * MINUTO) });
  comPedidos(valendo, 1001);
  const r1 = await rodar(valendo);
  // Mutante: cada execução (a cada 5 min, e cada aviso) chamava o /oauth/token que acabou de falhar.
  assert.deepEqual([r1.parou, r1.processados, trocasDeToken(valendo), valendo.trilha.includes("limiteTokenGlobal")], [undefined, 1, 0, false]);
  assert.deepEqual(noCartao(valendo), [null, null]);

  const vencendo = criarBlingFalso();
  ajustarConexao(vencendo, { accessExpiresAt: iso(AGORA + MINUTO), tokenRetryAt: iso(AGORA + 2 * MINUTO) });
  comPedidos(vencendo, 1001);
  const restaurar = semLog();
  const r2 = await rodar(vencendo).finally(restaurar);
  assert.deepEqual([r2.parou, r2.processados, trocasDeToken(vencendo), vencendo.bling.chamadas.length], ["limite_token", 0, 0, 0]);
  assert.deepEqual([linha(vencendo, 1001)?.pending, linha(vencendo, 1001)?.attempts], [true, 0]);
  assert.deepEqual(noCartao(vencendo), [BARRADA, iso(AGORA)]);
});

test("401 com token_retry_at no futuro: para por limite_token sem chamar o /oauth/token", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { tokenRetryAt: iso(AGORA + 2 * MINUTO) });
  f.bling.forcadas.push({ caminho: /^\/pedidos\/vendas\/\d+$/, vezes: 1, resposta: () => json(401, { error: { type: "invalid_token" } }) });
  comPedidos(f, 1001);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual([r.parou, trocasDeToken(f), f.trilha.includes("limiteTokenGlobal")], ["limite_token", 0, false]);
  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.attempts], [true, 0]);
  // O Bling acabou de recusar o token: ele não serve, e o cartão diz por que a loja parou.
  assert.deepEqual(noCartao(f), [BARRADA, iso(AGORA)]);
});

test("os avisos de renovação (barrada, ou o Bling fora) saem do cartão na primeira renovação que dá certo; outro erro do cartão fica", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA - MINUTO) });
  f.limiteToken = true;
  comPedidos(f, 1001);
  // O /oauth/token fora com o token ainda valendo: a loja segue, com o motivo no cartão.
  const fora = criarBlingFalso();
  ajustarConexao(fora, { accessExpiresAt: iso(AGORA + 20 * MINUTO) });
  fora.bling.oauth = () => json(503, { error: "fora do ar" });
  const restaurar = semLog();
  try {
    await rodar(f);
    assert.deepEqual(noCartao(f), [BARRADA, iso(AGORA)]);
    // 5 min depois o limite libera: a renovação dá certo, e o aviso, que perdeu o motivo, sai (antes ficava o dia).
    f.limiteToken = false;
    f.agora += 5 * MINUTO;
    const r = await rodar(f);
    assert.deepEqual([r.parou, f.conexao?.tokenVersion, linha(f, 1001)?.kind], [undefined, 4, "venda"]);
    assert.deepEqual(noCartao(f), [null, null]);

    await rodar(fora);
    assert.deepEqual(noCartao(fora), [FALHOU, iso(AGORA)]);
    // Passado o recuo de 5 min, o Bling volta: a renovação dá certo e o aviso dela sai (antes só saía o de barrada).
    fora.bling.oauth = null;
    fora.agora += 6 * MINUTO;
    await rodar(fora);
    assert.deepEqual([fora.conexao?.tokenVersion, ...noCartao(fora)], [4, null, null]);
  } finally {
    restaurar();
  }

  // O que não é dele (falta de escopo, varredura parada) fica: só sai quando o motivo dele some.
  const outro = criarBlingFalso();
  const escopo = { lastError: "O app do Bling está sem permissão para ler pedidos ou contatos.", lastErrorAt: iso(AGORA - 10 * MINUTO) };
  ajustarConexao(outro, { accessExpiresAt: iso(AGORA + 10 * MINUTO), ...escopo });
  await rodar(outro);
  assert.deepEqual([outro.conexao?.tokenVersion, ...noCartao(outro)], [4, escopo.lastError, escopo.lastErrorAt]);
});

test("tirar o aviso de renovação com o banco falhando não para a execução: o aviso fica e o log diz", async () => {
  for (const aviso of [BARRADA, FALHOU]) {
    const f = criarBlingFalso();
    ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO), lastError: aviso, lastErrorAt: iso(AGORA - 10 * MINUTO) });
    comPedidos(f, 1001);
    const atualizar = f.deps.conexoes.atualizarConexao;
    f.deps.conexoes.atualizarConexao = async (t, campos) => {
      if (campos.last_error === null) throw new Error("supabase 503 (blip)");
      return atualizar(t, campos);
    };
    const logs = capturarLogs();
    const r = await rodar(f).finally(logs.restaurar);

    assert.deepEqual([r.parou, r.falhas, f.conexao?.tokenVersion, linha(f, 1001)?.kind], [undefined, 0, 4, "venda"], aviso);
    assert.equal(f.conexao?.lastError, aviso);
    assert.ok(logs.linhas.some((l) => l.includes("loja loja-1: tirar o aviso de renovação do cartão falhou")), logs.linhas.join("\n"));
  }
});

test("token_retry_at vencido: renova, e a renovação que dá certo zera o recuo", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO), tokenRetryAt: iso(AGORA - MINUTO) });
  comPedidos(f, 1001);
  const r = await rodar(f);
  assert.deepEqual([r.parou, trocasDeToken(f), f.conexao?.tokenRetryAt, f.conexao?.tokenVersion], [undefined, 1, null, 4]);
});

test("401 com o limite global de /oauth/token esgotado: para por limite, sem marcar reconectar", async () => {
  const f = criarBlingFalso();
  f.limiteToken = true;
  f.bling.forcadas.push({ caminho: /^\/pedidos\/vendas\/\d+$/, vezes: 1, resposta: () => json(401, { error: { type: "invalid_token" } }) });
  comPedidos(f, 1001);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.equal(r.parou, "limite_token");
  assert.deepEqual([f.conexao?.status, f.emails.length, trocasDeToken(f)], ["ativa", 0, 0]);
  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.attempts], [true, 0]);
  assert.deepEqual(noCartao(f), [BARRADA, iso(AGORA)]);
});

test("limite global de /oauth/token: com o token ainda valendo segue sem renovar; vencendo, para a loja", async () => {
  const valendo = criarBlingFalso();
  valendo.limiteToken = true;
  ajustarConexao(valendo, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  comPedidos(valendo, 1001);
  const r1 = await rodar(valendo);
  assert.deepEqual([r1.parou, r1.processados, trocasDeToken(valendo)], [undefined, 1, 0]);
  assert.deepEqual(noCartao(valendo), [null, null]);

  const vencendo = criarBlingFalso();
  vencendo.limiteToken = true;
  ajustarConexao(vencendo, { accessExpiresAt: iso(AGORA + MINUTO) });
  comPedidos(vencendo, 1001);
  const restaurar = semLog();
  const r2 = await rodar(vencendo).finally(restaurar);
  assert.deepEqual([r2.parou, r2.processados, vencendo.bling.chamadas.length], ["limite_token", 0, 0]);
  assert.deepEqual([linha(vencendo, 1001)?.pending, linha(vencendo, 1001)?.attempts, vencendo.conexao?.status], [true, 0, "ativa"]);
  assert.deepEqual(noCartao(vencendo), [BARRADA, iso(AGORA)]);
});

test("renovação barrada com o token vencido, hora após hora (prova R2-T1): o cartão e o log dizem por que a loja parou", async () => {
  const f = criarBlingFalso();
  // O access venceu há 1 min e o limite global segue barrando (Upstash fora, o balde da instância cheio).
  ajustarConexao(f, { accessExpiresAt: iso(AGORA - MINUTO), lastWebhookAt: iso(AGORA - MINUTO) });
  f.limiteToken = true;
  f.bling.pedidos.set(5001, pedidoDoBling(5001));
  avisar(f, 5001);
  const logs = capturarLogs();
  const paradas: Array<string | undefined> = [];
  try {
    for (let n = 0; n < 12; n += 1) {
      f.agora = AGORA + n * 5 * MINUTO;
      const gatilho = n % 2 === 0 ? "cron" : "aviso";
      paradas.push((await sincronizarLoja(LOJA, gatilho, 60_000, VIDA[gatilho], f.deps)).parou);
    }
  } finally {
    logs.restaurar();
  }

  assert.ok(paradas.every((p) => p === "limite_token"), paradas.join(","));
  assert.equal(linha(f, 5001)?.pending, true, "a venda espera a renovação, sem gastar tentativa");
  // Mutante (a prova): nada no cartão, e a loja parecia conectada sem vender. A hora é a da última execução.
  assert.deepEqual(noCartao(f), [BARRADA, iso(f.agora)]);
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1") && /renovação barrada/.test(l)), logs.linhas.join("\n"));
  // Barrar não é recusa do Bling: nem reconectar, nem e-mail, nem disjuntor.
  assert.deepEqual([f.conexao?.status, f.emails.length, f.conexao?.consecutiveFailures], ["ativa", 0, 0]);
});
