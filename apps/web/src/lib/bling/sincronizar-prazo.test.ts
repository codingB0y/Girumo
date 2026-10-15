import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
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

import { idDaVendaBling } from "./pedido-girumo";
import { sincronizarLoja } from "./sincronizar";

/**
 * A vida da função (spec §3 "Varredura, histórico e drenagem"): a rota passa ao motor quanto resta do
 * `maxDuration`. Chamada que tem efeito fora — o envio ao Meta (timeout de 10 s), o /oauth/token (15 s)
 * — só começa se o timeout inteiro, mais 2 s para gravar o que ela fez, cabe antes da morte da função
 * e do fim da trava; nunca é encurtada (abortar uma chamada que o outro lado concluiu reenviaria o
 * evento ou perderia o refresh rotacionado). As gravações do que já aconteceu param 2 s antes da morte.
 */

function venda(f: BlingFalso, id = 1001): void {
  f.bling.pedidos.set(id, pedidoDoBling(id));
  f.pedidos.set(id, linhaPendente(id));
}

const linha = (f: BlingFalso, id: number) => f.pedidos.get(id);
const trocasDeToken = (f: BlingFalso) => chamadasDoBling(f, "/oauth/token").length;

/** O timeout que o motor deu a cada chamada ao /oauth/token. */
function timeoutsDaRenovacao(f: BlingFalso): Array<number | undefined> {
  const renovar = f.deps.oauth.renovar;
  const tempos: Array<number | undefined> = [];
  f.deps.oauth.renovar = (refresh, credenciais, opcoes) => {
    tempos.push(opcoes?.timeoutMs);
    return renovar(refresh, credenciais, opcoes);
  };
  return tempos;
}

/** O Bling segura o pedido e o contato (429 três vezes cada): o Meta só sai em 14,35 s. */
function blingLento(f: BlingFalso): void {
  const limite = () => json(429, { error: { type: "TOO_MANY_REQUESTS", period: "second" } });
  for (const caminho of [/^\/pedidos\/vendas\/\d+$/, /^\/contatos\/\d+$/]) f.bling.forcadas.push({ caminho, vezes: 3, resposta: limite });
}

test("Meta com 11 s de vida não começa: a rodada para por orçamento e a linha fica como estava, com a venda já ligada", async () => {
  const f = criarBlingFalso();
  venda(f);
  // O orçamento (45 s) sobra; a função é que morre em 11 s, e o envio precisa de 10 s + 2 s.
  const r = await sincronizarLoja(LOJA, "aviso", 45_000, 11_000, f.deps);

  assert.deepEqual([r.parou, f.meta.enviados.length], ["orcamento", 0]);
  const l = linha(f, 1001);
  assert.deepEqual([l?.pending, l?.attempts, l?.kind, l?.icStatus, l?.orderId], [true, 0, null, null, idDaVendaBling(LOJA, 1001)]);
});

test("Meta com 13 s de vida começa, com o timeout inteiro de 10 s", async () => {
  const f = criarBlingFalso();
  venda(f);
  const r = await sincronizarLoja(LOJA, "aviso", 45_000, 13_000, f.deps);

  assert.deepEqual([r.parou, f.meta.enviados.map((e) => e.timeoutMs), linha(f, 1001)?.kind], [undefined, [10_000], "venda"]);
});

test("Meta perto do fim do orçamento com a função viva: o envio leva o timeout inteiro, nunca encurtado", async () => {
  const f = criarBlingFalso();
  venda(f);
  blingLento(f);
  await sincronizarLoja(LOJA, "aviso", 25_000, VIDA.aviso, f.deps);

  // Mutante (a prova M1): 25 − 14,35 − 2 = 8,65 s; o Meta que concluísse em 9 s receberia os eventos de novo.
  assert.deepEqual(f.meta.enviados.map((e) => e.timeoutMs), [10_000]);
  assert.deepEqual([linha(f, 1001)?.icStatus, linha(f, 1001)?.purchaseStatus], ["enviado", "enviado"]);
});

test("/oauth/token com 16 s de vida não começa (nem gasta o limite global); com 18 s começa, com o timeout inteiro de 15 s", async () => {
  const curta = criarBlingFalso();
  ajustarConexao(curta, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  venda(curta);
  const r = await sincronizarLoja(LOJA, "aviso", 45_000, 16_000, curta.deps);
  // Mutante: começava com 1 s de folga, e o par que o Bling emitisse no fim do timeout podia morrer com a função antes
  // de gravado (o refresh velho já rotacionou: invalid_grant → reconectar).
  assert.deepEqual([r.parou, trocasDeToken(curta), curta.trilha.includes("limiteTokenGlobal")], ["orcamento", 0, false]);
  assert.deepEqual([linha(curta, 1001)?.pending, linha(curta, 1001)?.attempts, curta.conexao?.tokenVersion], [true, 0, 3]);

  const longa = criarBlingFalso();
  ajustarConexao(longa, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  venda(longa);
  const tempos = timeoutsDaRenovacao(longa);
  const r2 = await sincronizarLoja(LOJA, "aviso", 45_000, 18_000, longa.deps);
  assert.deepEqual([r2.parou, tempos, longa.conexao?.tokenVersion], [undefined, [15_000], 4]);
});

test("renovação perto do fim do orçamento com a função viva: o /oauth/token leva o timeout inteiro, nunca encurtado", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  venda(f);
  const tempos = timeoutsDaRenovacao(f);
  await sincronizarLoja(LOJA, "aviso", 10_000, VIDA.aviso, f.deps);

  // Mutante (a prova M1): 10 − 2 = 8 s; o par que o Bling emitisse em 9 s se perdia, e o refresh velho já morreu.
  assert.deepEqual([tempos, f.conexao?.tokenVersion], [[15_000], 4]);
});

test("o banco cai logo depois do Meta aceitar, perto da morte da função: as novas tentativas de gravar param 2 s antes dela", async () => {
  const f = criarBlingFalso();
  venda(f);
  // O Meta leva 9,9 s (dentro do timeout), e o banco recusa o status até 14 s (a 1ª gravação, a venda em orders, passa).
  const enviar = f.deps.meta.enviar;
  f.deps.meta.enviar = async (a) => {
    f.agora += 9_900;
    return enviar(a);
  };
  const salvar = f.deps.pedidos.salvarEfeitos;
  const tentativas: number[] = [];
  f.deps.pedidos.salvarEfeitos = async (...args) => {
    if (f.meta.enviados.length === 0) return salvar(...args);
    tentativas.push(f.agora - AGORA);
    if (f.agora < AGORA + 14_000) throw new Error("supabase 503 (blip)");
    return salvar(...args);
  };
  const restaurar = semLog();
  await sincronizarLoja(LOJA, "aviso", 45_000, 15_000, f.deps).finally(restaurar);

  // A morte em 15 s, o teto em 13 s: a 4ª tentativa cairia em 14,55 s. Mutante (o teto sem os 2 s, ou o antigo, o
  // fim da trava em 75 s): ela saía a 0,45 s da morte, sem tempo de terminar a gravação.
  assert.deepEqual(tentativas, [10_250, 10_550, 11_550]);
  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.attempts], [true, 1]);
});

test("par novo que o banco recusa perto da morte da função: as novas tentativas de gravar param 2 s antes dela", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  // O Bling leva 10 s para renovar (dentro do timeout), e o banco recusa o par até 17 s.
  const renovar = f.deps.oauth.renovar;
  f.deps.oauth.renovar = async (refresh, credenciais, opcoes) => {
    f.agora += 10_000;
    return renovar(refresh, credenciais, opcoes);
  };
  const salvar = f.deps.conexoes.salvarTokensRenovados;
  const momentos: number[] = [];
  f.deps.conexoes.salvarTokensRenovados = async (...args) => {
    momentos.push(f.agora - AGORA);
    if (f.agora < AGORA + 17_000) throw new Error("supabase 503 (blip)");
    return salvar(...args);
  };
  const logs = capturarLogs();
  await sincronizarLoja(LOJA, "aviso", 45_000, 18_000, f.deps).finally(logs.restaurar);

  // A morte em 18 s, o teto em 16 s: 0, 0,5 s e 2 s depois da renovação; a de 5 s cairia em 17,5 s. Mutante (o teto
  // sem os 2 s, ou o antigo, a trava em 75 s): ela saía a 0,5 s da morte, sem tempo de terminar a gravação.
  assert.deepEqual(momentos.slice(0, 3), [10_000, 10_500, 12_500]);
  assert.ok(momentos.every((m) => m <= 16_000), momentos.join(","));
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1") && /não foi gravado/.test(l)), logs.linhas.join("\n"));
});

test("a trava nunca passa da vida da função: morta, ela não segura a loja", async () => {
  const f = criarBlingFalso();
  // Outra execução tem a trava: o motor só pede a dele e sai.
  f.trava = { dono: "outra-execucao", ate: AGORA + MINUTO };
  await sincronizarLoja(LOJA, "aviso", 45_000, 20_000, f.deps);

  // Mutante: o orçamento mais a folga (75 s) segurava a loja 55 s depois de a função morrer.
  assert.deepEqual(f.trilha, ["conexoes.pegarTrava 20"]);
});
