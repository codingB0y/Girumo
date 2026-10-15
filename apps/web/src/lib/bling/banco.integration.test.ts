import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { atualizarConexao, lerConexao } from "@/lib/stores/bling-conexoes";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { PedidoResumo } from "./tipos";

/**
 * A migração 20261013120000_integracao_bling contra o Supabase de DEV (job e2e, depois da DDL), em duas
 * lojas descartáveis criadas aqui e apagadas no fim (a cascata de organizations leva bling_* e orders).
 * - loja: trava (claim/release), fila (enqueue), listas (recompute_lists), orders.source e a store da
 *   conexão (o select dela tem de casar com as colunas da migração).
 * - vizinha: números do cartão (bling_resumo); o que a loja tem nunca aparece neles, e vice-versa.
 *   Nos casos da fila, um canário com os mesmos ids da loja, que nunca pode mudar.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const DIA = 86_400_000;
const NO_FUTURO = "2030-01-01T00:00:00Z";
/** Loja ativa e trava livre: o ponto de partida dos casos da trava. */
const LIVRE = { status: "ativa", paused_until: null, lease_holder: null, lease_until: null };

let loja = "";
let vizinha = "";

function pular(): boolean {
  const motivo = EM_PRODUCAO ? "SUPABASE_URL é de produção" : LIGADO ? null : "E2E_TENANT_ID ausente";
  if (motivo) console.warn(`[bling/banco] ${motivo} — teste de integração pulado`);
  return motivo !== null;
}

const db = () => getSupabaseAdmin();

async function inserir(tabela: string, linhas: Record<string, unknown>[]): Promise<void> {
  const { error } = await db().from(tabela).insert(linhas);
  if (error) throw new Error(`${tabela}: ${error.message}`);
}

/** As tabelas bling_* não têm id: o update vai pela chave. */
async function mudar(tabela: string, chave: Record<string, string | number>, campos: Record<string, unknown>) {
  const { error } = await db().from(tabela).update(campos).match(chave);
  if (error) throw new Error(`${tabela}: ${error.message}`);
}

const mudarConexao = (campos: Record<string, unknown>) => mudar("bling_connections", { tenant_id: loja }, campos);
const mudarPedido = (id: number, campos: Record<string, unknown>) =>
  mudar("bling_orders", { tenant_id: loja, bling_order_id: id }, campos);

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data as T;
}

const pegar = (dono: string) => rpc<boolean>("bling_claim", { p_tenant: loja, p_holder: dono, p_seconds: 30 });
const soltar = (dono: string) => rpc<null>("bling_release", { p_tenant: loja, p_holder: dono });
const enfileirar = (origem: string, itens: object[]) =>
  rpc<number>("bling_enqueue", { p_tenant: loja, p_origin: origem, p_items: itens });
const recalcular = (contato: number | null = null) =>
  rpc<number>("bling_recompute_lists", { p_tenant: loja, p_contact: contato });

type Trava = { lease_holder: string | null; lease_until: string | null };

async function lerTrava(): Promise<Trava> {
  const { data, error } = await db().from("bling_connections").select("lease_holder, lease_until")
    .eq("tenant_id", loja).single();
  if (error) throw new Error(`bling_connections: ${error.message}`);
  return data as Trava;
}

type Pedido = {
  pending: boolean; low_priority: boolean; origin: string; attempts: number; snapshot: unknown;
  snapshot_at: string | null; next_try_at: string;
};

async function lerPedido(id: number): Promise<Pedido> {
  const { data, error } = await db().from("bling_orders")
    .select("pending, low_priority, origin, attempts, snapshot, snapshot_at, next_try_at")
    .eq("tenant_id", loja).eq("bling_order_id", id).single();
  if (error) throw new Error(`bling_orders ${id}: ${error.message}`);
  return data as Pedido;
}

/** Item da lista de pedidos do Bling, como a varredura e o histórico mandam para a fila. */
function resumo(id: number, situacaoId = 9, total = 150.5, contatoId: number | null = 77): PedidoResumo {
  return { id, numero: String(id), data: "2026-10-10", total, contatoId, situacaoId };
}

/**
 * O que o motor grava ao processar: pending false, o estado nas colunas e o mesmo estado no retrato
 * (é com ele que a varredura compara). attempts e next_try_at fora do normal só para ver o enqueue zerá-los.
 */
const processado = (e: PedidoResumo) =>
  mudarPedido(e.id, {
    pending: false, attempts: 2, next_try_at: NO_FUTURO,
    snapshot: e, situacao_id: e.situacaoId, total: e.total, bling_contact_id: e.contatoId,
  });

/** "Agora" no relógio do banco: tolera a diferença para o relógio do runner. */
const pertoDeAgora = (iso: string) => Math.abs(Date.parse(iso) - Date.now()) < 120_000;

/** Linha completa de bling_orders: no insert em lote, chave ausente vira NULL, não o default. */
function linhaPedido(tenant: string, id: number, campos: Record<string, unknown>): Record<string, unknown> {
  return {
    tenant_id: tenant, bling_order_id: id, bling_contact_id: null, kind: null, total: null, sale_at: null,
    origem: null, purchase_status: null, pending: false, last_error: null, origin: "aviso", ...campos,
  };
}

const doContato = (tenant: string, id: number, contatoId: number, kind: string, total: number) =>
  linhaPedido(tenant, id, { bling_contact_id: contatoId, kind, total });

/** Canário: do histórico e excluído, um estado que aviso ou varredura vazados para a vizinha mudariam. */
const canario = (id: number) => linhaPedido(vizinha, id, {
  origin: "historico", kind: "excluido", low_priority: true, situacao_id: 9, total: 150.5, bling_contact_id: 77,
});

/**
 * Roda os casos da loja com um canário na vizinha nos mesmos ids e confere a linha inteira dele no fim.
 * Apaga o canário depois: o caso do bling_resumo conta as linhas da vizinha.
 */
async function semVazarParaVizinha(ids: number[], casos: () => Promise<void>): Promise<void> {
  const ler = async (): Promise<unknown[]> => {
    const { data, error } = await db().from("bling_orders").select("*").eq("tenant_id", vizinha)
      .in("bling_order_id", ids).order("bling_order_id");
    if (error) throw new Error(`bling_orders da vizinha: ${error.message}`);
    return data ?? [];
  };
  await inserir("bling_orders", ids.map(canario));
  try {
    const antes = await ler();
    await casos();
    assert.deepEqual(await ler(), antes, "a vizinha mudou");
  } finally {
    const { error } = await db().from("bling_orders").delete().eq("tenant_id", vizinha).in("bling_order_id", ids);
    if (error) throw new Error(`bling_orders da vizinha: ${error.message}`);
  }
}

// phone_key é coluna gerada: nunca vai no insert.
const contato = (tenant: string, id: number, phone: string | null, lista: string | null = null) =>
  ({ tenant_id: tenant, bling_contact_id: id, phone, lista });

type Contato = { bling_contact_id: number; lista: string | null; lista_changed_at: string | null };

async function lerContatos(): Promise<Contato[]> {
  const { data, error } = await db().from("bling_contacts").select("bling_contact_id, lista, lista_changed_at")
    .eq("tenant_id", loja);
  if (error) throw new Error(`bling_contacts: ${error.message}`);
  return data as Contato[];
}

const listas = (cs: Contato[]) => Object.fromEntries(cs.map((c) => [c.bling_contact_id, c.lista]));
const datas = (cs: Contato[]) => Object.fromEntries(cs.map((c) => [c.bling_contact_id, c.lista_changed_at]));

before(async () => {
  if (pular()) return;
  const { data, error } = await db().from("organizations").insert([
    { name: `blingtest ${RUN}`, slug: `blingtest-${RUN}` },
    { name: `blingtest vizinha ${RUN}`, slug: `blingtest-vizinha-${RUN}` },
  ]).select("id");
  if (error) throw new Error(`organizations: ${error.message}`);
  // insert(...).select("id") devolve na ordem do envio.
  [loja, vizinha] = (data as { id: string }[]).map((o) => o.id);
  // Defaults da tabela: ativa, sem trava, sem high_value.
  await inserir("bling_connections", [{ tenant_id: loja }, { tenant_id: vizinha }]);
});

after(async () => {
  if (pular()) return;
  // organizations leva o resto junto (on delete cascade).
  const ids = [loja, vizinha].filter(Boolean);
  const falhas: string[] = [];
  for (const id of ids) {
    const { error } = await db().from("organizations").delete().eq("id", id);
    if (error) falhas.push(`${id}: ${error.message}`);
  }
  for (const tabela of ["bling_connections", "bling_contacts", "bling_orders"]) {
    const { count, error } = await db().from(tabela).select("tenant_id", { count: "exact", head: true })
      .in("tenant_id", ids);
    if (error) falhas.push(`${tabela}: ${error.message}`);
    else if (count) falhas.push(`${tabela}: ${count} linha(s) sobraram depois da cascata`);
  }
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("bling_claim: um dono por vez; vence; recusa reconectar, pausa e argumento inválido", { skip: pular() }, async () => {
  await mudarConexao(LIVRE);
  const [a, b] = [randomUUID(), randomUUID()];
  const [pegouA, pegouB] = await Promise.all([pegar(a), pegar(b)]);
  assert.equal(Number(pegouA) + Number(pegouB), 1, "dois donos ao mesmo tempo: exatamente um pega");
  const [dono, outro] = pegouA ? [a, b] : [b, a];
  assert.equal(await pegar(dono), true, "o mesmo dono renova");
  assert.equal(await pegar(outro), false, "trava válida não troca de dono");

  await mudarConexao({ lease_until: "2020-01-01T00:00:00Z" });
  assert.equal(await pegar(outro), true, "trava vencida: outro dono pega");
  assert.equal((await lerTrava()).lease_holder, outro);

  await mudarConexao({ ...LIVRE, status: "reconectar" });
  assert.equal(await pegar(dono), false, "loja a reconectar não trava");

  await mudarConexao({ ...LIVRE, paused_until: new Date(Date.now() + 3_600_000).toISOString() });
  assert.equal(await pegar(dono), false, "loja pausada não trava");
  await mudarConexao({ ...LIVRE, paused_until: "2020-01-01T00:00:00Z" });
  assert.equal(await pegar(dono), true, "pausa vencida não segura mais");

  const prazo = await db().rpc("bling_claim", { p_tenant: loja, p_holder: dono, p_seconds: 5 });
  assert.match(prazo.error?.message ?? "", /entre 10 e 600/);
  const semDono = await db().rpc("bling_claim", { p_tenant: loja, p_holder: null, p_seconds: 30 });
  assert.match(semDono.error?.message ?? "", /p_holder/, "dono nulo travaria sem marcar a trava");
});

test("bling_release: dono errado não solta; o certo solta", { skip: pular() }, async () => {
  await mudarConexao(LIVRE);
  const [dono, outro] = [randomUUID(), randomUUID()];
  assert.equal(await pegar(dono), true);
  await soltar(outro);
  assert.equal((await lerTrava()).lease_holder, dono, "dono errado não solta");
  await soltar(dono);
  assert.deepEqual(await lerTrava(), { lease_holder: null, lease_until: null });
  assert.equal(await pegar(outro), true, "solta de verdade: outro dono pega");
});

test("store da conexão × migração: lerConexao lê todas as colunas; a passada da varredura, o tamanho da fatia, a válvula do histórico e o recuo do token vão e voltam", { skip: pular() }, async () => {
  // Coluna do select que a migração não tem derruba toda leitura da conexão: o motor inteiro pararia.
  const nova = await lerConexao(loja);
  assert.deepEqual([nova?.scanSliceS, nova?.backfillFails], [null, 0], "padrões: fatia de 6 h, nenhuma falha");
  const [de, recuo] = ["2026-10-13T11:00:00.000Z", "2026-10-13T12:00:00.000Z"];
  await atualizarConexao(loja, { scan_from: de, scan_slice_s: 600, backfill_fails: 3, token_retry_at: recuo });
  const lida = await lerConexao(loja);
  assert.deepEqual(
    [lida?.tenantId, Date.parse(lida?.scanFrom ?? ""), lida?.scanSliceS, lida?.backfillFails, Date.parse(lida?.tokenRetryAt ?? "")],
    [loja, Date.parse(de), 600, 3, Date.parse(recuo)],
  );
  // Os CHECKs da migração: fatia positiva, falhas nunca negativas.
  await assert.rejects(atualizarConexao(loja, { scan_slice_s: 0 }), /scan_slice_s/);
  await assert.rejects(atualizarConexao(loja, { backfill_fails: -1 }), /backfill_fails/);
  await atualizarConexao(loja, { scan_from: null, scan_slice_s: null, backfill_fails: 0, token_retry_at: null });
  const limpa = await lerConexao(loja);
  assert.deepEqual([limpa?.scanFrom, limpa?.scanSliceS, limpa?.backfillFails, limpa?.tokenRetryAt], [null, null, 0, null]);
});

test("bling_enqueue aviso: pendente sem retrato; reabre linha processada sem mudar origin", { skip: pular() }, async () => {
  await inserir("bling_orders", [{
    tenant_id: loja, bling_order_id: 1002, origin: "historico", pending: false, attempts: 3,
    snapshot: resumo(1002), snapshot_at: new Date().toISOString(), next_try_at: NO_FUTURO,
  }]);
  // 1001 repetido no lote: sem o distinct, o on conflict tocaria a mesma linha duas vezes.
  assert.equal(await enfileirar("aviso", [{ id: 1001 }, { id: 1001 }, { id: 1002 }]), 2);

  const nova = await lerPedido(1001);
  assert.deepEqual([nova.pending, nova.origin, nova.attempts, nova.snapshot], [true, "aviso", 0, null]);
  assert.ok(pertoDeAgora(nova.next_try_at), nova.next_try_at);

  const reaberta = await lerPedido(1002);
  assert.deepEqual(
    [reaberta.pending, reaberta.origin, reaberta.attempts, reaberta.snapshot, reaberta.snapshot_at],
    [true, "historico", 0, null, null],
  );
  assert.ok(pertoDeAgora(reaberta.next_try_at), reaberta.next_try_at);
});

test("bling_enqueue varredura: compara com o retrato; sem retrato, com o processado", { skip: pular() }, async () => {
  const a = resumo(2001);
  assert.equal(await enfileirar("varredura", [a]), 1);
  const nova = await lerPedido(2001);
  assert.deepEqual([nova.pending, nova.origin, nova.snapshot], [true, "varredura", a]);

  await processado(a);
  assert.equal(await enfileirar("varredura", [a]), 0, "igual ao processado: nada muda");
  assert.equal((await lerPedido(2001)).pending, false);

  // Cada um dos três campos comparados, sozinho, devolve o pedido à fila com o retrato novo.
  const mudancas: [string, PedidoResumo][] = [
    ["situação", resumo(2001, 12)],
    ["total", resumo(2001, 9, 99)],
    ["contato", resumo(2001, 9, 150.5, 88)],
  ];
  for (const [campo, item] of mudancas) {
    await processado(a);
    assert.equal(await enfileirar("varredura", [item]), 1, `${campo} diferente`);
    const linha = await lerPedido(2001);
    assert.deepEqual([linha.pending, linha.attempts, linha.origin, linha.snapshot], [true, 0, "varredura", item], campo);
    assert.ok(pertoDeAgora(linha.next_try_at), `${campo}: ${linha.next_try_at}`);
  }

  // Sem retrato (um aviso apagou), compara com as colunas do último processado.
  await processado(a);
  await enfileirar("aviso", [{ id: 2001 }]);
  assert.equal(await enfileirar("varredura", [a]), 0, "igual às colunas: segue pendente para o GET");
  const semRetrato = await lerPedido(2001);
  assert.deepEqual([semRetrato.pending, semRetrato.snapshot], [true, null]);
  assert.equal(await enfileirar("varredura", [resumo(2001, 12)]), 1);
  assert.deepEqual((await lerPedido(2001)).snapshot, resumo(2001, 12));
});

test("bling_enqueue varredura: recuo, retorno ao processado, 2 casas, último do lote", { skip: pular() }, async () => {
  // Pendente falhando (attempts 3, próxima tentativa adiante): o mesmo retrato não zera o recuo.
  const falhando = resumo(2003, 12);
  await enfileirar("varredura", [falhando]);
  await mudarPedido(2003, { attempts: 3, next_try_at: NO_FUTURO });
  assert.equal(await enfileirar("varredura", [falhando]), 0);
  const recuo = await lerPedido(2003);
  assert.deepEqual([recuo.pending, recuo.attempts, Date.parse(recuo.next_try_at)], [true, 3, Date.parse(NO_FUTURO)]);

  // Processado em A, a varredura vê B e, antes de processar, A de novo: o retrato volta a ser A.
  const [a, b] = [resumo(2004), resumo(2004, 12)];
  await enfileirar("varredura", [a]);
  await processado(a);
  assert.equal(await enfileirar("varredura", [b]), 1);
  assert.equal(await enfileirar("varredura", [a]), 1, "voltou ao estado processado com B na fila");
  assert.deepEqual((await lerPedido(2004)).snapshot, a);

  // Total em 2 casas dos dois lados: 10,499 é o 10,50 guardado, no retrato e na coluna (após um aviso).
  await enfileirar("varredura", [resumo(2005, 9, 10.5)]);
  await processado(resumo(2005, 9, 10.5));
  assert.equal(await enfileirar("varredura", [resumo(2005, 9, 10.499)]), 0, "contra o retrato");
  await enfileirar("aviso", [{ id: 2005 }]);
  assert.equal(await enfileirar("varredura", [resumo(2005, 9, 10.499)]), 0, "contra a coluna numeric(12,2)");

  // O mesmo pedido duas vezes no lote (páginas que se deslocam): vale o último lido.
  assert.equal(await enfileirar("varredura", [resumo(2002, 9), resumo(2002, 12)]), 1);
  assert.deepEqual((await lerPedido(2002)).snapshot, resumo(2002, 12));
});

test("bling_enqueue historico: cria o que falta, não toca no que existe, último do lote", { skip: pular() }, async () => {
  await inserir("bling_orders", [
    { tenant_id: loja, bling_order_id: 3001, origin: "varredura", pending: false, attempts: 2, situacao_id: 9, total: 10 },
  ]);
  assert.equal(await enfileirar("historico", [resumo(3001, 12), resumo(3002, 9), resumo(3002, 15)]), 1);

  const existente = await lerPedido(3001);
  assert.deepEqual([existente.pending, existente.origin, existente.attempts, existente.snapshot], [false, "varredura", 2, null]);
  const criada = await lerPedido(3002);
  assert.deepEqual([criada.pending, criada.origin, criada.attempts, criada.snapshot], [true, "historico", 0, resumo(3002, 15)]);
  assert.ok(criada.snapshot_at);
});

test("bling_enqueue low_priority: histórico entra baixo; aviso e varredura sobre ele zeram", { skip: pular() }, async () => {
  await semVazarParaVizinha([4001, 4002, 4003, 4004, 4005], async () => {
    assert.equal(await enfileirar("historico", [resumo(4001), resumo(4002), resumo(4003)]), 3);
    for (const id of [4001, 4002, 4003]) {
      const linha = await lerPedido(id);
      assert.deepEqual([linha.pending, linha.low_priority], [true, true], `${id}`);
    }

    assert.equal(await enfileirar("aviso", [{ id: 4001 }]), 1);
    const avisada = await lerPedido(4001);
    assert.deepEqual([avisada.pending, avisada.low_priority, avisada.origin], [true, false, "historico"]);

    // Varredura igual ao retrato do histórico não é pendência nova: segue baixa. Com mudança, zera.
    assert.equal(await enfileirar("varredura", [resumo(4002)]), 0);
    assert.equal((await lerPedido(4002)).low_priority, true);
    assert.equal(await enfileirar("varredura", [resumo(4002, 12)]), 1);
    const varrida = await lerPedido(4002);
    assert.deepEqual(
      [varrida.pending, varrida.low_priority, varrida.origin, varrida.snapshot],
      [true, false, "historico", resumo(4002, 12)],
    );

    // Linha nova do aviso e da varredura nasce normal.
    await enfileirar("aviso", [{ id: 4004 }]);
    await enfileirar("varredura", [resumo(4005)]);
    assert.deepEqual([(await lerPedido(4004)).low_priority, (await lerPedido(4005)).low_priority], [false, false]);
  });
});

test("bling_enqueue varredura: excluído que a lista ainda mostra volta à fila; venda igual não", { skip: pular() }, async () => {
  await semVazarParaVizinha([4101, 4102], async () => {
    // A mesma linha nas duas (processada, sem retrato como o 404 grava, recuo adiante); só o kind muda.
    const [excluido, venda] = [resumo(4101), resumo(4102)];
    for (const [e, kind] of [[excluido, "excluido"], [venda, "venda"]] as const) {
      await enfileirar("varredura", [e]);
      await processado(e);
      await mudarPedido(e.id, { kind, snapshot: null, snapshot_at: null });
    }

    assert.equal(await enfileirar("varredura", [excluido]), 1, "um 404 transitório marcou excluído; a lista mostra o pedido");
    const reaberto = await lerPedido(4101);
    assert.deepEqual(
      [reaberto.pending, reaberto.attempts, reaberto.low_priority, reaberto.snapshot],
      [true, 0, false, excluido],
    );
    assert.ok(pertoDeAgora(reaberto.next_try_at), reaberto.next_try_at);

    // Já na fila e falhando (o processamento caiu antes de gravar o kind): a varredura não zera o recuo.
    await mudarPedido(4101, { attempts: 3, next_try_at: NO_FUTURO });
    assert.equal(await enfileirar("varredura", [excluido]), 0, "excluído pendente com recuo adiante não é reaberto");
    const naFila = await lerPedido(4101);
    assert.deepEqual([naFila.pending, naFila.attempts, Date.parse(naFila.next_try_at)], [true, 3, Date.parse(NO_FUTURO)]);

    assert.equal(await enfileirar("varredura", [venda]), 0, "venda igual ao processado não reabre");
    const parada = await lerPedido(4102);
    assert.deepEqual([parada.pending, parada.attempts, parada.snapshot], [false, 2, null]);
  });
});

test("bling_recompute_lists: por pessoa, high_value, escopo do contato e lista_changed_at", { skip: pular() }, async () => {
  await inserir("bling_contacts", [
    contato(loja, 6001, "5562999990001"), contato(loja, 6002, "5562999990002"),
    contato(loja, 6003, "5562999990003"), contato(loja, 6004, "5562999990004"),
    // A mesma cliente cadastrada duas vezes (com e sem o nono dígito): mesma phone_key, uma pessoa.
    contato(loja, 6005, "5562999990005"), contato(loja, 6006, "556299990005"),
    // Sem telefone: cada contato é uma pessoa sozinho.
    contato(loja, 6007, null), contato(loja, 6008, null),
  ]);
  await inserir("bling_orders", [
    doContato(loja, 6101, 6001, "venda", 500), doContato(loja, 6102, 6002, "venda", 100),
    doContato(loja, 6103, 6003, "pedido", 70),
    doContato(loja, 6104, 6004, "ignorado", 0), doContato(loja, 6114, 6004, "excluido", 30),
    doContato(loja, 6105, 6005, "venda", 50), doContato(loja, 6106, 6006, "pedido", 90),
    doContato(loja, 6107, 6007, "pedido", 40), doContato(loja, 6108, 6008, "venda", 80),
    // Venda da vizinha com o mesmo id de contato da 6004: não conta na loja.
    doContato(vizinha, 6904, 6004, "venda", 9999),
  ]);

  // high_value nulo: quem comprou é comprador, ninguém é alto_valor.
  await mudarConexao({ high_value: null });
  assert.equal(await recalcular(), 7);
  const base = {
    6001: "comprador", 6002: "comprador", 6003: "lead", 6004: null,
    6005: "comprador", 6006: "comprador", 6007: "lead", 6008: "comprador",
  };
  assert.deepEqual(listas(await lerContatos()), base);

  // high_value 500, loja toda: a venda de exatamente 500 vira alto_valor; o resto fica onde está.
  const antes = datas(await lerContatos());
  await mudarConexao({ high_value: 500 });
  assert.equal(await recalcular(), 1);
  const agora = await lerContatos();
  assert.deepEqual(listas(agora), { ...base, 6001: "alto_valor" });
  assert.notEqual(datas(agora)[6001], antes[6001], "mudou de lista: lista_changed_at anda");
  assert.deepEqual({ ...datas(agora), 6001: null }, { ...antes, 6001: null }, "não mudou de lista: a data fica");

  // Sem nada novo, recalcular não mexe em ninguém.
  assert.equal(await recalcular(), 0);
  assert.deepEqual(datas(await lerContatos()), datas(agora));

  // Por contato (o caminho do motor): a pessoa inteira, e só ela.
  await inserir("bling_orders", [doContato(loja, 6116, 6006, "venda", 600), doContato(loja, 6113, 6003, "venda", 10)]);
  assert.equal(await recalcular(6006), 2);
  const porContato = { ...base, 6001: "alto_valor", 6005: "alto_valor", 6006: "alto_valor" };
  assert.deepEqual(listas(await lerContatos()), porContato, "a 6003 não é da pessoa da 6006");
  assert.equal(await recalcular(), 1);
  assert.deepEqual(listas(await lerContatos()), { ...porContato, 6003: "comprador" });
});

test("bling_resumo: 30 dias, Meta, fila, histórico e pessoas por lista, sem vazar entre lojas", { skip: pular() }, async () => {
  const ha = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();
  const venda = (dias: number, total: number, origem: string, meta: string) =>
    ({ kind: "venda", total, sale_at: ha(dias), origem, purchase_status: meta });
  await inserir("bling_orders", [
    linhaPedido(vizinha, 7101, venda(1, 100, "anuncio", "enviado")),
    linhaPedido(vizinha, 7102, { ...venda(10, 50.5, "grupo", "fora_da_janela"), origin: "historico" }),
    linhaPedido(vizinha, 7103, { ...venda(2, 20, "sem_origem", "erro"), origin: "varredura" }),
    // 40 dias: fora dos números de 30 dias, mas conta como lido do histórico.
    linhaPedido(vizinha, 7104, { ...venda(40, 1000, "anuncio", "enviado"), origin: "historico" }),
    linhaPedido(vizinha, 7105, { kind: "pedido", total: 30, pending: true, origin: "varredura" }),
    // Falha = erro no último processamento, pendente ou não: a 7106 desistiu, a 7107 volta a tentar.
    // A 7105, pendente sem erro, não é falha.
    linhaPedido(vizinha, 7106, { last_error: "falhou 6 vezes", origin: "historico" }),
    linhaPedido(vizinha, 7107, { kind: "pedido", total: 12, pending: true, last_error: "timeout", origin: "varredura" }),
    // Da loja: contaria em tudo se vazasse para a vizinha.
    linhaPedido(loja, 7901, { ...venda(1, 999, "anuncio", "enviado"), last_error: "x", origin: "historico" }),
    linhaPedido(loja, 7902, { kind: "pedido", total: 5, pending: true }),
  ]);
  await inserir("bling_contacts", [
    // A mesma pessoa em dois cadastros (com e sem o nono dígito) conta uma vez.
    contato(vizinha, 7001, "5562988880001", "comprador"),
    contato(vizinha, 7002, "556288880001", "comprador"),
    contato(vizinha, 7003, "5562988880003", "alto_valor"),
    // Sem telefone, cada contato é uma pessoa.
    contato(vizinha, 7004, null, "lead"),
    contato(vizinha, 7005, null, "lead"),
    contato(vizinha, 7006, null, null),
    contato(loja, 7901, "5562977770001", "alto_valor"),
  ]);

  assert.deepEqual(await rpc("bling_resumo", { p_tenant: vizinha }), {
    vendas_30d: 3, vendido_30d: 170.5,
    origem_30d: { anuncio: 1, grupo: 1, sem_origem: 1 },
    meta_30d: { enviado: 1, fora_da_janela: 1, sem_pixel: 0, sem_dados: 0, desligado: 0, erro: 1 },
    pendentes: 2, falhas: 2, historico_lidos: 3,
    listas: { alto_valor: 1, comprador: 1, lead: 2 },
  });
  // A outra direção: a loja vê só a venda de 30 dias dela (os outros casos não gravam sale_at).
  const daLoja = await rpc<{ vendas_30d: number; vendido_30d: number }>("bling_resumo", { p_tenant: loja });
  assert.deepEqual([daLoja.vendas_30d, daLoja.vendido_30d], [1, 999]);
});

test("orders.source: padrão 'manual', aceita 'bling' e orders_source_check recusa o resto", { skip: pular() }, async () => {
  const fonteGravada = async (extra: Record<string, unknown>): Promise<string> => {
    const { data, error } = await db().from("orders").insert({ tenant_id: loja, phone: "", value: 10, ...extra })
      .select("source").single();
    if (error) throw new Error(`orders: ${error.message}`);
    return (data as { source: string }).source;
  };
  assert.equal(await fonteGravada({}), "manual");
  assert.equal(await fonteGravada({ source: "bling" }), "bling");

  const { error } = await db().from("orders").insert({ tenant_id: loja, phone: "", value: 10, source: "outro" });
  assert.equal(error?.code, "23514", "check_violation");
  // O nome fixo da migração (sem sufixo de constraint duplicada) é o que recusa.
  assert.match(error?.message ?? "", /"orders_source_check"/);
});
