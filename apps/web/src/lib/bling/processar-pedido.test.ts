import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGORA,
  ajustarConexao,
  campanha,
  capturarLogs,
  CHAVE_DA_MARIA,
  criarBlingFalso,
  DIA,
  HORA,
  iso,
  json,
  LEAD_MARIA,
  linhaPendente,
  LOJA,
  MARIA,
  mariaGuardada,
  MINUTO,
  pedidoDoBling,
  PIXEL,
  type BlingFalso,
} from "@/test/bling-falso";

import { ErroBling } from "./cliente";
import { contextoDaLoja, processarPedido } from "./processar-pedido";
import { soNaPrimeiraVez } from "./sincronizar-execucao";

/**
 * O processamento de uma linha da fila contra o mundo falso (`src/test/bling-falso.ts`): o
 * cliente HTTP de verdade sobre o Bling falso, stores em memória com as regras do banco, Meta e
 * projeção em `orders` que só registram. A projeção de verdade (com `source = 'bling'`) tem teste
 * próprio em `pedido-girumo.test.ts`; o que cai no meio, em `processar-pedido-efeitos.test.ts`.
 */

/** `podeRelerSituacoes` dividido entre chamadas = a mesma execução (uma releitura por situação desconhecida). */
function processar(f: BlingFalso, id: number, conexao = f.conexao, podeRelerSituacoes?: () => boolean) {
  const linha = f.pedidos.get(id);
  assert.ok(linha, `linha ${id} na fila`);
  assert.ok(conexao, "loja conectada");
  return processarPedido(contextoDaLoja(LOJA, structuredClone(conexao), f.cliente(), f.deps, { podeRelerSituacoes }), linha);
}

/** Pedido no Bling e a linha dele na fila (aviso: sem retrato, o processamento faz GET). */
function comPedido(f: BlingFalso, id: number, extra: Parameters<typeof pedidoDoBling>[1] = {}): void {
  f.bling.pedidos.set(id, pedidoDoBling(id, extra));
  f.pedidos.set(id, linhaPendente(id));
}

/** Linha já processada como venda, com o pedido em `orders` e os dois eventos enviados. */
function vendaJaProcessada(f: BlingFalso, id: number): void {
  f.girumo.set("pedido-9", { id: "pedido-9", total: 350, telefone: LEAD_MARIA.phone, saleAt: AGORA - DIA, lead: LEAD_MARIA });
  f.contatos.set(MARIA.id, mariaGuardada({ lista: "comprador" }));
  f.pedidos.set(
    id,
    linhaPendente(id, {
      kind: "venda",
      orderId: "pedido-9",
      saleAt: iso(AGORA - DIA),
      icStatus: "enviado",
      purchaseStatus: "enviado",
      blingContactId: MARIA.id,
      situacaoId: 9,
      total: 350,
      origem: "grupo",
      origemDetalhe: "VIP 1",
    }),
  );
}

const chamadasA = (f: BlingFalso, caminho: string) => f.bling.chamadas.filter((c) => c.caminho === caminho).length;

test("venda nova: pedido em orders com o lead, IC e Purchase num envio só (chat), retrato gravado e listas depois", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  await processar(f, 1001);

  const pedidos = [...f.girumo.values()];
  assert.equal(pedidos.length, 1);
  assert.deepEqual([pedidos[0].lead?.id, pedidos[0].total, pedidos[0].telefone], ["lead-1", 350, "5562999998888"]);

  assert.equal(f.meta.enviados.length, 1);
  const [envio] = f.meta.enviados;
  assert.deepEqual([envio.pixelId, envio.timeoutMs, envio.payload.test_event_code], [PIXEL, 10_000, undefined]);
  assert.deepEqual(envio.payload.data.map((ev) => [ev.event_name, ev.event_id, ev.action_source]), [
    ["InitiateCheckout", "bling-ic-1001", "chat"],
    ["Purchase", "bling-1001", "chat"],
  ]);
  assert.deepEqual(envio.payload.data[1].custom_data, { value: 350, currency: "BRL", order_id: "1050", origem: "grupo", faixa: "normal" });
  // Celular com e sem o 9, e a chave da pessoa como external_id: o Meta casa por eles.
  assert.equal(envio.payload.data[1].user_data.ph?.length, 2);
  assert.ok(envio.payload.data[1].user_data.external_id);

  const linha = f.pedidos.get(1001);
  assert.ok(linha);
  assert.deepEqual(
    [linha.kind, linha.orderId, linha.icStatus, linha.purchaseStatus, linha.pending, linha.origem, linha.origemDetalhe],
    ["venda", pedidos[0].id, "enviado", "enviado", false, "grupo", "VIP 1"],
  );
  assert.deepEqual(linha.snapshot, pedidoDoBling(1001));
  assert.equal(linha.icSentAt, iso(f.agora));
  assert.equal(f.contatos.get(MARIA.id)?.phoneKey, CHAVE_DA_MARIA);
  assert.equal(f.contatos.get(MARIA.id)?.lista, "comprador");

  const salvo = f.trilha.indexOf("pedidos.salvarProcessado 1001 true");
  assert.ok(salvo >= 0 && f.trilha.indexOf("contatos.recalcularListas 77") > salvo, "listas só depois de gravar");
  // A ligação com orders e o status do Meta vão para o banco assim que acontecem.
  assert.ok(f.trilha.indexOf("pedidos.salvarEfeitos 1001") > f.trilha.indexOf("projetar venda"));
  assert.ok(f.trilha.lastIndexOf("pedidos.salvarEfeitos 1001") > f.trilha.indexOf("meta.enviar"));
});

test("cadastro do site com utm: origem anúncio, e fbc/fbp do cadastro vão no Purchase", async () => {
  const f = criarBlingFalso();
  f.cadastros.push({ phoneKey: CHAVE_DA_MARIA, criadoEm: AGORA - 2 * DIA, utmCampaign: "primavera", utmContent: "video-1", fbc: "fb.1.1.abc", fbp: "fb.1.2.def" });
  comPedido(f, 1001, { total: 800 });
  await processar(f, 1001);

  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.origem, linha?.origemDetalhe], ["anuncio", "primavera · video-1"]);
  const [, purchase] = f.meta.enviados[0].payload.data;
  assert.deepEqual([purchase.user_data.fbc, purchase.user_data.fbp], ["fb.1.1.abc", "fb.1.2.def"]);
  assert.deepEqual([purchase.custom_data.origem, purchase.custom_data.faixa], ["anuncio", "alto"]);
  assert.equal(f.contatos.get(MARIA.id)?.lista, "alto_valor");
});

test("pedido em aberto: só o InitiateCheckout, nada em orders e a pessoa vira lead", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1002, { situacaoId: 6, total: 120 });
  await processar(f, 1002);

  assert.deepEqual(f.meta.enviados.map((e) => e.payload.data.map((ev) => ev.event_name)), [["InitiateCheckout"]]);
  const linha = f.pedidos.get(1002);
  assert.deepEqual([linha?.kind, linha?.icStatus, linha?.purchaseStatus, linha?.orderId, linha?.origem], ["pedido", "enviado", null, null, null]);
  assert.equal(f.girumo.size, 0);
  assert.equal(f.contatos.get(MARIA.id)?.lista, "lead");
  assert.ok(!f.trilha.includes("leads.porTelefones"), "lead do funil só para venda");
});

test("venda que foi cancelada: some de orders, nada reenvia ao Meta e a pessoa volta a lead", async () => {
  const f = criarBlingFalso();
  vendaJaProcessada(f, 1003);
  f.bling.pedidos.set(1003, pedidoDoBling(1003, { situacaoId: 12 }));
  await processar(f, 1003);

  assert.equal(f.girumo.size, 0);
  assert.equal(f.meta.enviados.length, 0);
  const linha = f.pedidos.get(1003);
  assert.deepEqual(
    [linha?.kind, linha?.orderId, linha?.purchaseStatus, linha?.origem, linha?.pending],
    ["pedido", null, "enviado", null, false],
  );
  assert.equal(f.contatos.get(MARIA.id)?.lista, "lead");
  assert.equal(chamadasA(f, "/contatos/77"), 0, "contato lido há 1 h vem do cache");
});

test("pedido apagado no Bling (404): excluído, sai de orders e a lista do contato recalcula", async () => {
  const f = criarBlingFalso();
  vendaJaProcessada(f, 1004);
  await processar(f, 1004);

  assert.equal(f.girumo.size, 0);
  const linha = f.pedidos.get(1004);
  assert.deepEqual([linha?.kind, linha?.snapshot, linha?.blingContactId, linha?.pending], ["excluido", null, 77, false]);
  assert.ok(f.trilha.includes("contatos.recalcularListas 77"));
  assert.equal(f.contatos.get(MARIA.id)?.lista, null);
});

test("listas do contato que falham: o pedido termina (a rede do cron recalcula) e o log diz a loja, o pedido e o contato", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001);
  f.deps.contatos.recalcularListas = async () => {
    throw new Error("canceling statement due to statement timeout");
  };
  const logs = capturarLogs();
  await processar(f, 1001).finally(logs.restaurar);

  assert.equal(f.pedidos.get(1001)?.pending, false);
  const linha = logs.linhas.find((l) => l.includes("statement timeout"));
  assert.ok(linha?.includes("loja loja-1 pedido 1001 contato 77"), logs.linhas.join("\n"));
});

test("Meta recusa: status erro, mensagem guardada, efeito gravado na hora e nova tentativa em 1 min", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  f.meta.resposta = { ok: false, error: "Parâmetro inválido (código 100)" };
  comPedido(f, 1001);
  await processar(f, 1001);

  const linha = f.pedidos.get(1001);
  assert.ok(linha);
  assert.deepEqual([linha.icStatus, linha.purchaseStatus, linha.metaError], ["erro", "erro", "Parâmetro inválido (código 100)"]);
  assert.deepEqual([linha.pending, linha.attempts, linha.nextTryAt], [true, 1, iso(f.agora + MINUTO)]);
  assert.equal(linha.lastError, "meta: Parâmetro inválido (código 100)");
  assert.ok(f.trilha.lastIndexOf("pedidos.salvarEfeitos 1001") > f.trilha.indexOf("meta.enviar"));
});

test("Meta recusa: o log leva a loja, o pedido e o fbtrace_id (o que o suporte do Meta pede para achar o caso)", async () => {
  const f = criarBlingFalso();
  f.meta.resposta = { ok: false, error: "Parâmetro inválido (código 100)", raw: { message: "Invalid parameter", code: 100, fbtrace_id: "AbC123xyz_-9" } };
  comPedido(f, 1001);
  const logs = capturarLogs();
  await processar(f, 1001).finally(logs.restaurar);

  const linha = logs.linhas.find((l) => l.includes("Parâmetro inválido"));
  assert.ok(linha?.includes("loja loja-1 pedido 1001") && linha.includes("fbtrace_id AbC123xyz_-9"), logs.linhas.join("\n"));
});

test("Meta recusa na 6ª tentativa: o pedido sai da fila com o erro à vista", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  f.meta.resposta = { ok: false, error: "Token expirado" };
  comPedido(f, 1001);
  f.pedidos.set(1001, linhaPendente(1001, { attempts: 5 }));
  await processar(f, 1001);

  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.pending, linha?.purchaseStatus, linha?.metaError], [false, "erro", "Token expirado"]);
});

test("venda de 12 dias atrás: fora da janela do Meta, nada enviado, mas entra em orders pelo dia dela", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1001, { data: "2026-10-01" });
  await processar(f, 1001);

  assert.equal(f.meta.enviados.length, 0);
  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.icStatus, linha?.purchaseStatus], ["fora_da_janela", "fora_da_janela"]);
  // 12:00 de São Paulo do dia do pedido.
  assert.equal(linha?.saleAt, "2026-10-01T15:00:00.000Z");
  assert.equal([...f.girumo.values()][0]?.saleAt, Date.parse("2026-10-01T15:00:00.000Z"));
});

test("Meta desligado no cartão: desligado, sem envio e sem ler campanha", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { metaEnabled: false });
  comPedido(f, 1001);
  await processar(f, 1001);

  assert.equal(f.meta.enviados.length, 0);
  assert.deepEqual([f.pedidos.get(1001)?.icStatus, f.pedidos.get(1001)?.purchaseStatus], ["desligado", "desligado"]);
  assert.ok(!f.trilha.includes("campanhas.comMetadata"));
});

test("canal de venda fora do Meta (a Yampi já manda o evento): desligado e nada enviado, mas a venda entra, com origem e lista", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { metaSkipStoreIds: [204937216] });
  comPedido(f, 1001, { lojaId: 204937216 });
  await processar(f, 1001);

  assert.equal(f.meta.enviados.length, 0);
  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.kind, linha?.icStatus, linha?.purchaseStatus, linha?.origem], ["venda", "desligado", "desligado", "grupo"]);
  assert.equal(f.girumo.size, 1);
  assert.equal(f.contatos.get(MARIA.id)?.lista, "comprador");
  assert.ok(!f.trilha.includes("campanhas.comMetadata"));

  // Outro canal, e o pedido lançado direto no Bling (sem canal), seguem indo ao Meta.
  for (const lojaId of [205291049, null]) {
    const outro = criarBlingFalso();
    ajustarConexao(outro, { metaSkipStoreIds: [204937216] });
    comPedido(outro, 1001, { lojaId });
    await processar(outro, 1001);
    assert.equal(outro.meta.enviados.length, 1, String(lojaId));
  }
});

test("sem pixel (nenhum, ou vários sem escolha): sem_pixel e nada enviado", async () => {
  for (const campanhas of [[], [campanha("camp-1", PIXEL), campanha("camp-2", "9876543210")]]) {
    const f = criarBlingFalso();
    f.campanhas = campanhas;
    comPedido(f, 1001);
    await processar(f, 1001);
    assert.equal(f.meta.enviados.length, 0);
    assert.deepEqual([f.pedidos.get(1001)?.icStatus, f.pedidos.get(1001)?.purchaseStatus], ["sem_pixel", "sem_pixel"]);
  }
});

test("cliente sem telefone, e-mail nem cadastro: sem_dados, e a venda entra sem origem", async () => {
  const f = criarBlingFalso();
  f.bling.contatos.set(78, { ...MARIA, id: 78, celular: null, telefone: null, email: null });
  comPedido(f, 1001, { contatoId: 78 });
  await processar(f, 1001);

  assert.equal(f.meta.enviados.length, 0);
  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.icStatus, linha?.purchaseStatus, linha?.origem], ["sem_dados", "sem_dados", "sem_origem"]);
  assert.equal([...f.girumo.values()][0]?.telefone, null);
});

test("cliente no descadastro (com ou sem 55): nada vai ao Meta, sem_dados, e a venda entra em orders como sempre", async () => {
  const f = criarBlingFalso();
  f.optouts = ["62999998888"];
  comPedido(f, 1001);
  await processar(f, 1001);

  assert.equal(f.meta.enviados.length, 0);
  const linha = f.pedidos.get(1001);
  assert.deepEqual([linha?.icStatus, linha?.purchaseStatus, linha?.origem], ["sem_dados", "sem_dados", "grupo"]);
  assert.equal(f.girumo.size, 1);
});

test("descadastro: lido uma vez por execução, e só quando algum pedido chega ao pixel", async () => {
  const f = criarBlingFalso();
  f.optouts = ["5562999998888"];
  comPedido(f, 1001);
  comPedido(f, 1002, { situacaoId: 6 });
  assert.ok(f.conexao);
  const ctx = contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(), f.deps);
  for (const id of [1001, 1002]) {
    const linha = f.pedidos.get(id);
    assert.ok(linha);
    await processarPedido(ctx, linha);
  }
  assert.equal(f.trilha.filter((t) => t === "optouts.chaves").length, 1);
  assert.equal(f.meta.enviados.length, 0);

  const desligado = criarBlingFalso();
  ajustarConexao(desligado, { metaEnabled: false });
  comPedido(desligado, 1001);
  await processar(desligado, 1001);
  assert.ok(!desligado.trilha.includes("optouts.chaves"));
});

test("campanha escolhida no cartão com código de teste: o código vai no envio", async () => {
  const f = criarBlingFalso();
  f.campanhas = [campanha("camp-1", PIXEL, "TEST123"), campanha("camp-2", "9876543210")];
  ajustarConexao(f, { metaCampaignId: "camp-1" });
  comPedido(f, 1001);
  await processar(f, 1001);

  assert.deepEqual([f.meta.enviados[0]?.pixelId, f.meta.enviados[0]?.payload.test_event_code], [PIXEL, "TEST123"]);
});

test("contato lido há menos de 24 h vem do cache; mais velho, GET de novo", async () => {
  const fresco = criarBlingFalso();
  fresco.contatos.set(MARIA.id, mariaGuardada({ fetchedAt: iso(AGORA - HORA) }));
  comPedido(fresco, 1001);
  await processar(fresco, 1001);
  assert.equal(chamadasA(fresco, "/contatos/77"), 0);

  const velho = criarBlingFalso();
  velho.contatos.set(MARIA.id, mariaGuardada({ fetchedAt: iso(AGORA - 25 * HORA) }));
  comPedido(velho, 1001);
  await processar(velho, 1001);
  assert.equal(chamadasA(velho, "/contatos/77"), 1);
});

test("contato vencido e o Bling fora (transitório ou limite): segue com o guardado, e o log diz a loja", async () => {
  const respostas = [() => json(503, {}), () => json(429, { error: { type: "TOO_MANY_REQUESTS", period: "second" } })];
  for (const resposta of respostas) {
    const f = criarBlingFalso();
    f.contatos.set(MARIA.id, mariaGuardada({ fetchedAt: iso(AGORA - 3 * DIA) }));
    f.bling.forcadas.push({ caminho: /^\/contatos\/77$/, vezes: Number.POSITIVE_INFINITY, resposta });
    comPedido(f, 1001);
    const logs = capturarLogs();
    await processar(f, 1001).finally(logs.restaurar);
    // Mutante: a venda esperava o Bling voltar, e o pedido gastava as 5 tentativas por causa do cadastro.
    assert.deepEqual([f.pedidos.get(1001)?.kind, [...f.girumo.values()][0]?.lead?.id], ["venda", "lead-1"]);
    assert.ok(logs.linhas.some((l) => l.includes("loja loja-1") && l.includes("contato 77")), logs.linhas.join("\n"));
  }
});

test("contato que nunca veio e o Bling fora: o erro sobe (o pedido tenta de novo depois)", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  f.bling.forcadas.push({ caminho: /^\/contatos\/77$/, vezes: Number.POSITIVE_INFINITY, resposta: () => json(503, {}) });
  comPedido(f, 1001);
  await assert.rejects(processar(f, 1001), (e: unknown) => e instanceof ErroBling && e.tipo === "transitorio");
  assert.equal(f.girumo.size, 0);
});

test("contato apagado no Bling: segue com o cache velho", async () => {
  const f = criarBlingFalso();
  f.bling.contatos.clear();
  f.contatos.set(MARIA.id, mariaGuardada({ fetchedAt: iso(AGORA - 3 * DIA) }));
  comPedido(f, 1001);
  await processar(f, 1001);
  assert.equal([...f.girumo.values()][0]?.lead?.id, "lead-1");
  assert.equal(f.meta.enviados.length, 1);
});

test("situação que nem a releitura conhece: o pedido fica para depois, sem decidir nada, e a execução relê uma vez só", async () => {
  const f = criarBlingFalso();
  comPedido(f, 1005, { situacaoId: 777 });
  comPedido(f, 1006, { situacaoId: 777 });
  const umaExecucao = soNaPrimeiraVez();

  const primeiro = await processar(f, 1005, f.conexao, umaExecucao);
  const segundo = await processar(f, 1006, primeiro.conexao, umaExecucao);

  // Mutante: com a base desconhecida (ela mesma), a venda numa filha nova de Atendido virava pedido para sempre.
  const motivo = "situação 777 ainda não está na lista do Bling";
  assert.deepEqual([primeiro.adiado, segundo.adiado], [motivo, motivo]);
  assert.equal(chamadasA(f, "/situacoes/modulos"), 1);
  assert.ok(f.atualizacoes.some((a) => a.situations !== undefined), "a lista relida fica gravada");
  assert.deepEqual([f.girumo.size, f.meta.enviados.length, f.pedidos.get(1005)?.kind, f.pedidos.get(1006)?.kind], [0, 0, null, null]);
});

test("loja que nunca escolheu as situações de venda: a recarga não grava o padrão, e a filha de Atendido criada depois é venda", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { saleSituationIds: [], situationsAt: iso(AGORA - 2 * HORA) });
  // "Pago" nasceu no Bling depois da conexão, herdando de Atendido.
  f.bling.situacoes = [...f.bling.situacoes, { id: 777, nome: "Pago", base: 9 }];
  comPedido(f, 1005, { situacaoId: 777 });
  const { conexao } = await processar(f, 1005);

  assert.equal(f.pedidos.get(1005)?.kind, "venda");
  assert.ok(f.atualizacoes.some((a) => a.situations !== undefined));
  // Mutante: gravar o padrão de agora congelaria a próxima filha de Atendido como pedido para sempre.
  assert.ok(f.atualizacoes.every((a) => a.sale_situation_ids === undefined));
  assert.deepEqual(conexao.saleSituationIds, []);
});

test("recarga de situações que o prazo da execução interrompe: o erro sobe (orçamento), sem classificar com as velhas", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { situationsAt: iso(AGORA - 2 * HORA) });
  // Contato no cache: depois da recarga, nada mais vai ao Bling antes de decidir o pedido.
  f.contatos.set(MARIA.id, mariaGuardada());
  comPedido(f, 1005, { situacaoId: 777 });
  const linha = f.pedidos.get(1005);
  assert.ok(linha && f.conexao);
  // O GET do pedido sai em 0 ms; o da recarga, no ritmo de 350 ms, cairia depois do prazo.
  const ctx = contextoDaLoja(LOJA, structuredClone(f.conexao), f.cliente(AGORA + 300), f.deps);
  await assert.rejects(processarPedido(ctx, linha), (e: unknown) => e instanceof ErroBling && e.prazoEsgotado);
  assert.ok(!f.trilha.some((t) => t.startsWith("projetar")), "nada decidido com as situações velhas");
});

test("situação nova lida na recarga entra na classificação (rascunho que herda de Em digitação é ignorado)", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { situationsAt: iso(AGORA - 2 * HORA) });
  f.bling.situacoes = [...f.bling.situacoes, { id: 777, nome: "Rascunho", base: 21 }];
  comPedido(f, 1005, { situacaoId: 777 });

  const { conexao } = await processar(f, 1005);
  // Sem a recarga a 777 valeria por ela mesma e o pedido iria ao Meta como lead.
  assert.equal(f.pedidos.get(1005)?.kind, "ignorado");
  assert.equal(f.meta.enviados.length, 0);
  assert.ok(conexao.situations.some((s) => s.id === 777 && s.base === 21));
});
