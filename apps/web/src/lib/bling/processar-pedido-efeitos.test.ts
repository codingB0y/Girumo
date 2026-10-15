import assert from "node:assert/strict";
import { test } from "node:test";

import { AGORA, avisar, criarBlingFalso, iso, linhaPendente, LOJA, MINUTO, pedidoDoBling, type BlingFalso } from "@/test/bling-falso";

import { idDaVendaBling } from "./pedido-girumo";
import { contextoDaLoja, processarPedido } from "./processar-pedido";
import { ParadaDaRodada } from "./sincronizar-execucao";

/**
 * O que já aconteceu fora da fila — o pedido em `orders`, o evento aceito pelo Meta — chega ao banco
 * mesmo quando algo cai no meio: aviso que chega durante o processamento, banco fora, gravação que
 * falha e tenta de novo. O processamento normal está em `processar-pedido.test.ts`.
 */

function processar(f: BlingFalso, id: number) {
  const linha = f.pedidos.get(id);
  assert.ok(linha, `linha ${id} na fila`);
  assert.ok(f.conexao, "loja conectada");
  return processarPedido(contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(), f.deps), linha);
}

/** Pedido no Bling e a linha dele na fila (aviso: sem retrato, o processamento faz GET). */
function comPedido(f: BlingFalso, id: number): void {
  f.bling.pedidos.set(id, pedidoDoBling(id));
  f.pedidos.set(id, linhaPendente(id));
}

/** A gravação de efeitos falha nas chamadas de número `quais` (1 = a primeira), como um 503 do banco. */
function falharEfeitos(f: BlingFalso, quais: (n: number) => boolean): void {
  const salvar = f.deps.pedidos.salvarEfeitos;
  let n = 0;
  f.deps.pedidos.salvarEfeitos = async (...args) => {
    n += 1;
    if (quais(n)) throw new Error("supabase 503 (blip)");
    return salvar(...args);
  };
}

/** As esperas do motor, fora o ritmo de 350 ms do cliente: os recuos das novas tentativas. */
function recuos(f: BlingFalso): () => number[] {
  const esperas: number[] = [];
  const esperar = f.deps.esperar;
  f.deps.esperar = async (ms) => {
    esperas.push(ms);
    return esperar(ms);
  };
  return () => esperas.filter((ms) => ms !== 350);
}

test("aviso chega no meio: a gravação final não passa, as listas esperam e os efeitos ficam gravados", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  f.gancho = (entrada) => {
    if (entrada === "projetar venda") avisar(f, 1001);
  };
  await processar(f, 1001);

  assert.ok(f.trilha.includes("pedidos.salvarProcessado 1001 false"));
  assert.ok(!f.trilha.some((t) => t.startsWith("contatos.recalcularListas")));
  const linha = f.pedidos.get(1001);
  assert.ok(linha);
  // Fica pendente para o reprocesso, que acha o pedido em orders e os eventos já enviados.
  assert.deepEqual([linha.pending, linha.kind, linha.snapshot], [true, null, null]);
  assert.equal(linha.orderId, [...f.girumo.keys()][0]);
  assert.deepEqual([linha.icStatus, linha.purchaseStatus], ["enviado", "enviado"]);
});

test("queda depois de criar o pedido em orders: a ligação já está gravada e o reprocesso não duplica", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  const campanhas = f.deps.campanhas.comMetadata;
  f.deps.campanhas.comMetadata = async () => {
    throw new Error("banco fora do ar");
  };
  await assert.rejects(processar(f, 1001), /banco fora do ar/);
  const [criado] = [...f.girumo.keys()];
  assert.equal(f.pedidos.get(1001)?.orderId, criado);

  f.deps.campanhas.comMetadata = campanhas;
  await processar(f, 1001);
  assert.deepEqual([...f.girumo.keys()], [criado]);
  assert.equal(f.pedidos.get(1001)?.kind, "venda");
});

test("a ligação com orders falha uma vez ao gravar: tenta de novo depois de 0,3 s e o pedido termina", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  comPedido(f, 1001);
  falharEfeitos(f, (n) => n === 1);
  const esperas = recuos(f);
  await processar(f, 1001);

  // Mutante: sem nova tentativa o processamento cai, e a venda criada fica sem ligação.
  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.orderId, linha?.kind, linha?.pending], [idDaVendaBling(LOJA, 1001), "venda", false]);
  assert.deepEqual(esperas(), [300]);
  assert.equal(f.girumo.size, 1);
});

test("a ligação não grava nem nas 4 tentativas: o reprocesso acha a mesma venda (id determinístico), sem duplicar", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  comPedido(f, 1001);
  falharEfeitos(f, (n) => n <= 4);
  const esperas = recuos(f);
  await assert.rejects(processar(f, 1001), /503/);
  assert.equal(f.pedidos.get(1001)?.orderId, null, "a ligação não foi gravada");
  assert.deepEqual(esperas(), [300, 1_000, 3_000]);

  await processar(f, 1001);
  // A prova do revisor: antes, a segunda volta criava outra venda e a primeira ficava órfã (409 para apagar).
  assert.deepEqual([...f.girumo.keys()], [idDaVendaBling(LOJA, 1001)]);
  assert.equal(f.contadores.pedidosGirumo, 1);
  assert.equal(f.pedidos.get(1001)?.orderId, idDaVendaBling(LOJA, 1001));
});

test("a volta que acha a venda já criada (23505) usa a mesma hora: a venda, o created_at e os eventos batem", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  comPedido(f, 1001);
  falharEfeitos(f, (n) => n <= 4);
  await assert.rejects(processar(f, 1001), /503/);
  // A volta seguinte, 10 min depois: a venda já está em orders, sem ligação.
  f.agora += 10 * MINUTO;
  await processar(f, 1001);

  // A hora é a de quando o pedido foi visto pela 1ª vez (o dia dele), não a da nova tentativa.
  const visto = Date.parse(f.pedidos.get(1001)?.firstSeenAt ?? "");
  assert.equal(f.pedidos.get(1001)?.saleAt, iso(visto));
  assert.equal(f.girumo.get(idDaVendaBling(LOJA, 1001))?.saleAt, visto);
  const eventos = f.meta.enviados.at(-1)?.payload.data.map((ev) => [ev.event_name, ev.event_time]);
  assert.deepEqual(eventos, [["InitiateCheckout", Math.floor(visto / 1000)], ["Purchase", Math.floor(visto / 1000)]]);
});

test("sem tempo até o teto das gravações para esperar o recuo, a gravação de efeitos não tenta de novo", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  comPedido(f, 1001);
  falharEfeitos(f, (n) => n === 1);
  const esperas = recuos(f);
  const linha = f.pedidos.get(1001);
  assert.ok(linha && f.conexao);
  // O pedido e o contato levam 350 ms (o ritmo do cliente): o recuo de 0,3 s passaria do teto.
  const ctx = contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(), f.deps, { tetoDasGravacoes: AGORA + 500 });
  await assert.rejects(processarPedido(ctx, linha), /503/);
  assert.deepEqual(esperas(), []);
});

test("o banco cai logo depois do Meta aceitar: tenta gravar até o teto (o fim da trava), e o reprocesso não reenvia", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  comPedido(f, 1001);
  // Um blip de 4,5 s logo depois do envio (a 2ª gravação de efeitos é o status do Meta).
  let n = 0;
  const salvar = f.deps.pedidos.salvarEfeitos;
  f.deps.pedidos.salvarEfeitos = async (...args) => {
    n += 1;
    if (n >= 2 && f.agora < AGORA + 4_500) throw new Error("supabase 503 (blip)");
    return salvar(...args);
  };
  const linha = f.pedidos.get(1001);
  assert.ok(linha && f.conexao);
  // O efeito já aconteceu: a gravação vai até o teto (aqui, o fim da trava em 34 s), não desiste no blip.
  const ctx = contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(), f.deps, { fimDaTrava: AGORA + 34_000 });
  await processarPedido(ctx, linha);
  // Mutante: desistir antes do teto deixava o status sem gravar, e o reprocesso reenviava IC e Purchase.
  assert.deepEqual([f.pedidos.get(1001)?.icStatus, f.pedidos.get(1001)?.purchaseStatus], ["enviado", "enviado"]);
  avisar(f, 1001);
  await processar(f, 1001);
  assert.equal(f.meta.enviados.length, 1);
});

test("Meta sem o timeout inteiro mais 2 s até o fim da trava: não envia; a rodada para por orçamento e a linha fica como estava, com a venda já ligada", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  const linha = f.pedidos.get(1001);
  assert.ok(linha && f.conexao);
  // O pedido e o contato levam 350 ms (o ritmo do cliente): na hora do envio sobram 11,65 s, e o envio pede 12.
  const ctx = contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(), f.deps, { fimDaTrava: AGORA + 12_000 });
  await assert.rejects(processarPedido(ctx, linha), (e: unknown) => e instanceof ParadaDaRodada && e.motivo === "orcamento");
  assert.equal(f.meta.enviados.length, 0);
  const depois = f.pedidos.get(1001);
  assert.deepEqual([depois?.pending, depois?.attempts, depois?.kind, depois?.icStatus], [true, 0, null, null]);
  assert.equal(depois?.orderId, idDaVendaBling(LOJA, 1001));
});

test("Meta com o timeout inteiro mais 2 s cabendo até o fim da trava, no limite: envia com 10 s, nunca encurtado", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  const linha = f.pedidos.get(1001);
  assert.ok(linha && f.conexao);
  // 350 ms do ritmo + 10 s do envio + 2 s para gravar o status = o fim da trava.
  const ctx = contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(), f.deps, { fimDaTrava: AGORA + 12_350 });
  await processarPedido(ctx, linha);
  assert.equal(f.meta.enviados[0]?.timeoutMs, 10_000);
});

test("o status do Meta falha uma vez ao gravar: tenta de novo, fica gravado e o reprocesso não reenvia", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  comPedido(f, 1001);
  // 1ª gravação = a ligação com orders; 2ª = o status do Meta, logo depois do envio.
  falharEfeitos(f, (n) => n === 2);
  await processar(f, 1001);

  // Mutante: perder essa gravação faria o reprocesso mandar os dois eventos de novo ao Meta.
  assert.deepEqual([f.pedidos.get(1001)?.icStatus, f.pedidos.get(1001)?.purchaseStatus], ["enviado", "enviado"]);
  avisar(f, 1001);
  await processar(f, 1001);
  assert.equal(f.meta.enviados.length, 1);
});

test("queda depois do Meta aceitar: o envio já está gravado e o reprocesso não manda de novo", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  const salvarProcessado = f.deps.pedidos.salvarProcessado;
  f.deps.pedidos.salvarProcessado = async () => {
    throw new Error("banco fora do ar");
  };
  await assert.rejects(processar(f, 1001), /banco fora do ar/);
  assert.deepEqual([f.pedidos.get(1001)?.icStatus, f.pedidos.get(1001)?.purchaseStatus], ["enviado", "enviado"]);

  f.deps.pedidos.salvarProcessado = salvarProcessado;
  await processar(f, 1001);
  assert.equal(f.meta.enviados.length, 1);
  assert.equal(f.pedidos.get(1001)?.pending, false);
});
