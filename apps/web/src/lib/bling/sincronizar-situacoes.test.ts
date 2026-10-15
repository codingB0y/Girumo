import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  avisar,
  chamadasDoBling,
  criarBlingFalso,
  DIA,
  HORA,
  iso,
  json,
  listaPorAlteracao,
  LOJA,
  MINUTO,
  pedidoDoBling,
  pendentes,
  SITUACOES,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { idDaVendaBling } from "./pedido-girumo";
import { sincronizarLoja, type Gatilho } from "./sincronizar";

/**
 * As situações da conta no motor (spec §1 "Tipo do pedido"): o pedido numa situação que a lista ainda
 * não tem relê as situações uma vez por execução; ainda desconhecida, ele espera no recuo normal sem
 * contar como falha da loja. Lista vazia (módulo de vendas não reconhecido) classifica pelo padrão, e a
 * leitura só se repete depois de 24 h.
 */

function rodar(f: BlingFalso, gatilho: Gatilho = "aviso") {
  return sincronizarLoja(LOJA, gatilho, 60_000, VIDA[gatilho], f.deps);
}

/** Pedidos avisados (sem retrato: cada um custa um GET) numa situação. */
function avisados(f: BlingFalso, situacaoId: number, ...ids: number[]): void {
  for (const id of ids) {
    f.bling.pedidos.set(id, pedidoDoBling(id, { situacaoId }));
    avisar(f, id);
  }
}

/** Quantas vezes as situações foram lidas no Bling (cada leitura: os módulos e as do módulo de vendas). */
const leituras = (f: BlingFalso) => chamadasDoBling(f, "/situacoes/modulos").length;
const linha = (f: BlingFalso, id: number) => f.pedidos.get(id);
const NAO_LISTADA = 5555;

test("venda numa filha de Atendido criada depois da última leitura: relê na hora e é venda (prova R2-S2)", async () => {
  const f = criarBlingFalso();
  // Nunca escolheu (padrão na hora); situações lidas há 30 min, quando "Pago no Pix" ainda não existia.
  ajustarConexao(f, { saleSituationIds: [], situations: SITUACOES.filter((s) => s.id !== 4321), situationsAt: iso(AGORA - 30 * MINUTO), metaEnabled: false });
  avisados(f, 4321, 8001);
  const r = await rodar(f);

  // Mutante (a prova): a releitura esperava 1 h, a venda virava pedido com a fila fechada, e nada a reabria.
  assert.deepEqual([r.processados, linha(f, 8001)?.kind, linha(f, 8001)?.orderId], [1, "venda", idDaVendaBling(LOJA, 8001)]);
  assert.ok(f.conexao?.situations.some((s) => s.id === 4321 && s.base === 9), "a lista nova ficou gravada");
  assert.equal(leituras(f), 1);

  // E a varredura que passa por ela depois não muda nada: já está certa.
  f.agora += 10 * MINUTO;
  ajustarConexao(f, { lastScanAt: iso(f.agora - 10 * MINUTO), scanCursor: iso(f.agora - 30 * MINUTO) });
  f.bling.paginas = (q) => listaPorAlteracao(new Map([[8001, f.agora - 5 * MINUTO]]))(q).map((p) => ({ ...p, situacaoId: 4321 }));
  await rodar(f, "cron");
  assert.deepEqual([linha(f, 8001)?.kind, f.girumo.size], ["venda", 1]);
});

test("situação que nem a releitura conhece: espera no recuo normal com o motivo, sem contar falha nem disjuntor, e uma releitura por execução", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { saleSituationIds: [] });
  const ids = Array.from({ length: 25 }, (_, i) => 9000 + i);
  avisados(f, NAO_LISTADA, ...ids);
  const r = await rodar(f);

  // Mutante: contar como falha parava a loja por erros (25 > 20) — e como transitório, abria o disjuntor.
  assert.deepEqual([r.parou, r.falhas, r.processados], [undefined, 0, 0]);
  assert.deepEqual([f.conexao?.consecutiveFailures, f.conexao?.pausedUntil], [0, null]);
  // Mutante: reler a cada pedido eram 25 leituras (50 GETs) na mesma execução.
  assert.equal(leituras(f), 1);
  for (const id of ids) {
    const l = linha(f, id);
    assert.deepEqual([l?.pending, l?.kind, l?.attempts, l?.lastError], [true, null, 1, `situação ${NAO_LISTADA} ainda não está na lista do Bling`]);
    // O recuo normal: 1 min depois da tentativa.
    assert.ok(Date.parse(l?.nextTryAt ?? "") - AGORA >= MINUTO, `pedido ${id}: ${l?.nextTryAt}`);
  }

  // A execução seguinte relê de novo (uma vez): a situação apareceu no Bling, e os pedidos são classificados.
  f.agora += 2 * MINUTO;
  f.bling.situacoes = [...f.bling.situacoes, { id: NAO_LISTADA, nome: "Pago no cartão", base: 9 }];
  const depois = await rodar(f);
  assert.deepEqual([depois.processados, pendentes(f).length, leituras(f)], [25, 0, 2]);
  assert.ok(ids.every((id) => linha(f, id)?.kind === "venda"));
});

test("lista vazia (módulo de vendas não reconhecido, lido há 1 h): classifica pelo padrão, sem reler", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { situations: [], situationsAt: iso(AGORA - HORA), saleSituationIds: [], metaEnabled: false });
  avisados(f, 9, 1001);
  avisados(f, NAO_LISTADA, 1002);
  const r = await rodar(f);

  assert.deepEqual([r.processados, linha(f, 1001)?.kind, linha(f, 1002)?.kind], [2, "venda", "pedido"]);
  // Mutante: a lista vazia sozinha mandava reler a cada execução (e o desconhecido esperava em vez de classificar).
  assert.equal(leituras(f), 0);
});

test("módulo de vendas não reconhecido: grava a hora da leitura (relê só depois de 24 h) e a lista fica como estava", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { situations: [], situationsAt: null });
  f.bling.forcadas.push({ caminho: /^\/situacoes\/modulos$/, vezes: Number.POSITIVE_INFINITY, resposta: () => json(200, { data: [{ id: 1, nome: "Notas fiscais" }] }) });
  await rodar(f);
  assert.deepEqual([f.conexao?.situations, f.conexao?.situationsAt, leituras(f)], [[], iso(AGORA), 1]);

  // Mutante: só na memória, cada execução (a cada 5 min, e cada aviso) lia as situações de novo.
  f.agora += HORA;
  await rodar(f);
  assert.equal(leituras(f), 1);

  f.agora += DIA;
  await rodar(f);
  assert.equal(leituras(f), 2);
});
