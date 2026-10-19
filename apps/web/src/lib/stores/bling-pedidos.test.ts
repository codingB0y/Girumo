import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { PedidoResumo } from "@/lib/bling/tipos";
import {
  agendarNovaTentativa,
  contarPendentes,
  enfileirarPedidos,
  existePendenteVencido,
  lerResumo,
  listarPendentes,
  pedidosComCanal,
  reabrirDesde,
  salvarEfeitos,
  salvarProcessado,
  ultimasDoCartao,
  type EfeitosDoPedido,
  type ResultadoProcessamento,
} from "./bling-pedidos";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (molde de
 * `site-captures.test.ts`): a query que sai daqui é a de produção, só a rede é
 * trocada. Roda sem credencial nenhuma.
 */

type Chamada = { metodo: string; url: URL; prefer: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown; contentRange?: string };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500, corpo: { message: "sem resposta" } });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo, contentRange } = responder(chamada);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

const AGORA = new Date("2026-10-13T15:00:00.000Z");
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));

/** O `updated_at` como o PostgREST devolveu na leitura (com o `+` que a URL precisa codificar). */
const LIDO = "2026-10-13T14:58:00.123456+00:00";
const GRAVOU = (): Resposta => ({ status: 200, corpo: [{ bling_order_id: 101 }] });
const MUDOU = (): Resposta => ({ status: 200, corpo: [] });

const RESUMO_A: PedidoResumo = { id: 101, numero: "77", data: "2026-10-12", total: 149.9, contatoId: 555, situacaoId: 6, lojaId: 200000001 };
const RESUMO_B: PedidoResumo = { id: 102, numero: null, data: null, total: 10, contatoId: null, situacaoId: 9, lojaId: null };

test("aviso: um rpc bling_enqueue com os ids, sem o mesmo pedido duas vezes, e devolve o número do banco", async () => {
  responder = () => ({ status: 200, corpo: 2 });

  assert.equal(await enfileirarPedidos("loja-a", "aviso", [{ id: 7 }, { id: 9 }, { id: 7 }]), 2);

  assert.equal(chamadas.length, 1);
  const [{ metodo, url, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["POST", "/rest/v1/rpc/bling_enqueue"]);
  assert.deepEqual(corpo, { p_tenant: "loja-a", p_origin: "aviso", p_items: [{ id: 7 }, { id: 9 }] });
});

test("varredura e histórico mandam o PedidoResumo inteiro (o SQL lê id, total, contatoId e situacaoId); repetido vale o último", async () => {
  const mudou: PedidoResumo = { ...RESUMO_A, situacaoId: 9 };
  for (const origem of ["varredura", "historico"] as const) {
    chamadas.length = 0;
    responder = () => ({ status: 200, corpo: 1 });

    assert.equal(await enfileirarPedidos("loja-a", origem, [RESUMO_A, RESUMO_B, mudou]), 1);

    assert.deepEqual(chamadas[0].corpo, { p_tenant: "loja-a", p_origin: origem, p_items: [mudou, RESUMO_B] });
  }
});

test("lista vazia devolve 0 sem ir ao banco", async () => {
  assert.equal(await enfileirarPedidos("loja-a", "aviso", []), 0);
  assert.equal(await enfileirarPedidos("loja-a", "varredura", []), 0);
  assert.equal(chamadas.length, 0);
});

const LINHA_101 = {
  tenant_id: "loja-a",
  bling_order_id: "101",
  numero: "77",
  order_date: "2026-10-12",
  total: "149.90",
  situacao_id: "6",
  bling_contact_id: "555",
  kind: "pedido",
  order_id: null,
  origin: "varredura",
  first_seen_at: "2026-10-12T10:00:00+00:00",
  sale_at: null,
  ic_status: "enviado",
  purchase_status: null,
  meta_error: null,
  origem: "grupo",
  origem_detalhe: "VIP 1",
  snapshot: RESUMO_A,
  pending: true,
  attempts: 1,
  next_try_at: "2026-10-13T14:59:00+00:00",
  last_error: "limite",
  updated_at: LIDO,
};

test("pendentes vencidos: só da loja, pending, next_try_at até agora; o histórico depois, e os mais antigos primeiro", async () => {
  const torta = { ...LINHA_101, bling_order_id: 102, total: null, situacao_id: null, snapshot: { id: "102", total: "dez" } };
  const semCanal = { id: 103, numero: "77", data: "2026-10-12", total: 149.9, contatoId: 555, situacaoId: 6 };
  const antiga = { ...LINHA_101, bling_order_id: 103, snapshot: semCanal };
  responder = () => ({ status: 200, corpo: [LINHA_101, torta, antiga] });

  const linhas = await listarPendentes("loja-a", AGORA, 20);

  assert.deepEqual(filtros(chamadas[0].url), {
    tenant_id: "eq.loja-a",
    pending: "eq.true",
    next_try_at: "lte.2026-10-13T15:00:00.000Z",
    // Mutante: só por next_try_at, a venda que o aviso acabou de marcar espera atrás de 90 dias de histórico.
    order: "low_priority.asc,next_try_at.asc",
    limit: "20",
  });
  assert.ok(chamadas[0].url.searchParams.get("select")?.split(",").includes("updated_at"));
  // bigint e numeric podem chegar em texto: saem número.
  assert.deepEqual(linhas[0], {
    tenantId: "loja-a",
    blingOrderId: 101,
    numero: "77",
    orderDate: "2026-10-12",
    total: 149.9,
    situacaoId: 6,
    blingContactId: 555,
    kind: "pedido",
    orderId: null,
    origin: "varredura",
    firstSeenAt: "2026-10-12T10:00:00+00:00",
    saleAt: null,
    icStatus: "enviado",
    purchaseStatus: null,
    metaError: null,
    origem: "grupo",
    origemDetalhe: "VIP 1",
    snapshot: RESUMO_A,
    pending: true,
    attempts: 1,
    nextTryAt: "2026-10-13T14:59:00+00:00",
    lastError: "limite",
    // Texto exato do PostgREST: é o token que volta no `.eq("updated_at")` das gravações.
    updatedAt: LIDO,
  });
  // Retrato torto vira null: o processamento faz GET em vez de confiar nele.
  assert.deepEqual([linhas[1].blingOrderId, linhas[1].total, linhas[1].situacaoId, linhas[1].snapshot], [102, null, null, null]);
  // Retrato gravado antes de o canal existir vale, sem o canal ("não se sabe": o processamento decide se relê).
  assert.deepEqual([linhas[2].blingOrderId, linhas[2].snapshot], [103, semCanal]);
});

test("existe pendente vencido: uma linha basta, com o mesmo filtro", async () => {
  responder = () => ({ status: 200, corpo: [{ bling_order_id: 101 }] });
  assert.equal(await existePendenteVencido("loja-a", AGORA), true);
  assert.deepEqual(filtros(chamadas[0].url), {
    tenant_id: "eq.loja-a",
    pending: "eq.true",
    next_try_at: "lte.2026-10-13T15:00:00.000Z",
    limit: "1",
  });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await existePendenteVencido("loja-a", AGORA), false);
});

test("contar pendentes: HEAD com count exato, na loja, sem trazer linha (o PostgREST corta em 1000)", async () => {
  responder = () => ({ status: 200, contentRange: "*/1234" });

  assert.equal(await contarPendentes("loja-a"), 1234);

  const [{ metodo, url, prefer }] = chamadas;
  assert.equal(metodo, "HEAD");
  assert.match(prefer, /count=exact/);
  assert.deepEqual(filtros(url), { tenant_id: "eq.loja-a", pending: "eq.true" });
});

const EFEITOS: EfeitosDoPedido = {
  orderId: "ord-1",
  saleAt: new Date("2026-10-12T15:00:00.000Z"),
  icStatus: "enviado",
  icSentAt: new Date("2026-10-13T14:00:00.000Z"),
  purchaseStatus: "enviado",
  purchaseSentAt: new Date("2026-10-13T14:00:01.000Z"),
  metaError: null,
  origem: "anuncio",
  origemDetalhe: "C1 · A1",
};
const COLUNAS_DOS_EFEITOS = {
  order_id: "ord-1",
  sale_at: "2026-10-12T15:00:00.000Z",
  ic_status: "enviado",
  ic_sent_at: "2026-10-13T14:00:00.000Z",
  purchase_status: "enviado",
  purchase_sent_at: "2026-10-13T14:00:01.000Z",
  meta_error: null,
  origem: "anuncio",
  origem_detalhe: "C1 · A1",
};
const VENDA: ResultadoProcessamento = {
  numero: "77",
  orderDate: "2026-10-12",
  total: 149.9,
  situacaoId: 9,
  blingContactId: 555,
  kind: "venda",
  ...EFEITOS,
  snapshot: { ...RESUMO_A, situacaoId: 9 },
};

/** O instante do servidor muda a cada execução: confere o formato e troca por um marcador. */
function semRelogio(corpo: unknown, ...campos: string[]): Record<string, unknown> {
  const copia = { ...(corpo as Record<string, unknown>) };
  for (const campo of campos) {
    assert.match(String(copia[campo]), ISO, campo);
    copia[campo] = "agora";
  }
  return copia;
}

test("processado sem pendência: um UPDATE com o estado todo, o retrato usado e a fila zerada, se a linha não mudou", async () => {
  responder = GRAVOU;

  assert.equal(await salvarProcessado("loja-a", 101, VENDA, { pendente: false }, LIDO), true);

  assert.equal(chamadas.length, 1);
  const [{ metodo, url, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["PATCH", "/rest/v1/bling_orders"]);
  assert.deepEqual(filtros(url), { tenant_id: "eq.loja-a", bling_order_id: "eq.101", updated_at: `eq.${LIDO}` });
  assert.equal(url.searchParams.get("select"), "bling_order_id");
  const gravado = corpo as Record<string, unknown>;
  // O retrato é do mesmo instante da gravação.
  assert.equal(gravado.snapshot_at, gravado.updated_at);
  assert.deepEqual(semRelogio(corpo, "snapshot_at", "updated_at"), {
    numero: "77",
    order_date: "2026-10-12",
    total: 149.9,
    situacao_id: 9,
    bling_contact_id: 555,
    kind: "venda",
    ...COLUNAS_DOS_EFEITOS,
    snapshot: { ...RESUMO_A, situacaoId: 9 },
    snapshot_at: "agora",
    pending: false,
    attempts: 0,
    last_error: null,
    updated_at: "agora",
  });
});

test("processado com erro do Meta: retrato null apaga o retrato e a agenda vira nova tentativa", async () => {
  responder = GRAVOU;
  const excluido: ResultadoProcessamento = {
    ...VENDA,
    kind: "excluido",
    orderId: null,
    saleAt: null,
    icSentAt: null,
    purchaseSentAt: null,
    icStatus: "erro",
    purchaseStatus: "erro",
    metaError: "Token inválido",
    snapshot: null,
  };
  const agenda ={ pendente: true, tentativas: 2, proxima: new Date("2026-10-13T15:30:00.000Z"), erro: "Token inválido" } as const;

  assert.equal(await salvarProcessado("loja-a", 101, excluido, agenda, LIDO), true);

  const corpo = semRelogio(chamadas[0].corpo, "updated_at");
  assert.deepEqual([corpo.snapshot, corpo.snapshot_at, corpo.sale_at], [null, null, null]);
  // Sem envio agora, as datas de envio ficam de fora: gravar null apagaria a de um envio anterior.
  assert.ok(!("ic_sent_at" in corpo) && !("purchase_sent_at" in corpo));
  assert.deepEqual(
    [corpo.pending, corpo.attempts, corpo.next_try_at, corpo.last_error],
    [true, 2, "2026-10-13T15:30:00.000Z", "Token inválido"],
  );
});

test("aviso no meio do processamento (updated_at mudou): 0 linhas, false, e a pendência nova fica", async () => {
  responder = MUDOU;

  // Mutante: gravar sem o `.eq("updated_at")` marcaria como feito um pedido que mudou — um
  // order.deleted assim se perderia, porque a varredura não lista pedido apagado.
  assert.equal(await salvarProcessado("loja-a", 101, VENDA, { pendente: false }, LIDO), false);
  assert.equal(filtros(chamadas[0].url).updated_at, `eq.${LIDO}`);
});

test("efeitos: só pedido Girumo, hora da venda, Meta e origem, sem conferir nem trocar o updated_at nem tocar na fila", async () => {
  responder = () => ({ status: 204 });

  await salvarEfeitos("loja-a", 101, EFEITOS);

  assert.equal(chamadas.length, 1);
  const [{ metodo, url, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["PATCH", "/rest/v1/bling_orders"]);
  // Sem `updated_at` no filtro: o efeito já aconteceu (pedido em orders, evento no Meta) e
  // tem que ficar registrado mesmo com um aviso no meio, senão a próxima volta o repete.
  assert.deepEqual(filtros(url), { tenant_id: "eq.loja-a", bling_order_id: "eq.101" });
  // Sem pending/attempts/snapshot/updated_at: a linha que o aviso reabriu continua pendente.
  assert.deepEqual(corpo, COLUNAS_DOS_EFEITOS);
});

test("efeitos sem envio agora (datas de envio nulas): as colunas de data ficam de fora, as de status vão", async () => {
  responder = () => ({ status: 204 });

  await salvarEfeitos("loja-a", 101, { ...EFEITOS, icSentAt: null, purchaseSentAt: null, icStatus: "erro", purchaseStatus: "erro" });
  await salvarEfeitos("loja-a", 101, { ...EFEITOS, icSentAt: null });

  const [semEnvio, soPurchase] = chamadas.map((c) => c.corpo as Record<string, unknown>);
  // Mutante: gravar null zera a data do envio que já aconteceu (o cartão perde quando o evento saiu).
  assert.ok(!("ic_sent_at" in semEnvio) && !("purchase_sent_at" in semEnvio));
  assert.deepEqual([semEnvio.ic_status, semEnvio.purchase_status], ["erro", "erro"]);
  assert.ok(!("ic_sent_at" in soPurchase));
  assert.equal(soPurchase.purchase_sent_at, "2026-10-13T14:00:01.000Z");
});

test("nova tentativa: com data volta pendente; sem data desiste (pending false) e guarda o erro; só se a linha não mudou", async () => {
  responder = GRAVOU;

  assert.equal(await agendarNovaTentativa("loja-a", 101, 3, new Date("2026-10-13T15:30:00.000Z"), "transitorio", LIDO), true);
  assert.equal(await agendarNovaTentativa("loja-a", 101, 6, null, "transitorio", LIDO), true);

  const guarda = { tenant_id: "eq.loja-a", bling_order_id: "eq.101", updated_at: `eq.${LIDO}` };
  assert.deepEqual(filtros(chamadas[0].url), guarda);
  assert.deepEqual(semRelogio(chamadas[0].corpo, "updated_at"), {
    pending: true,
    attempts: 3,
    next_try_at: "2026-10-13T15:30:00.000Z",
    last_error: "transitorio",
    updated_at: "agora",
  });
  assert.deepEqual(filtros(chamadas[1].url), guarda);
  assert.deepEqual(semRelogio(chamadas[1].corpo, "updated_at"), {
    pending: false,
    attempts: 6,
    last_error: "transitorio",
    updated_at: "agora",
  });
});

test("nova tentativa com aviso no meio: 0 linhas, false (a pendência nova do aviso não leva o recuo)", async () => {
  responder = MUDOU;
  assert.equal(await agendarNovaTentativa("loja-a", 101, 3, new Date("2026-10-13T15:30:00.000Z"), "transitorio", LIDO), false);
  assert.equal(await agendarNovaTentativa("loja-a", 101, 6, null, "transitorio", LIDO), false);
});

test("reabrir desde o dia: volta pendente na hora (o que volta, atrás da venda ao vivo), zera tentativas, troca o updated_at (na fila, também o da linha sem dia) e conta pelo cabeçalho, não pelas linhas", async () => {
  responder = (c) => ({ status: 204, contentRange: c.url.searchParams.get("pending") === "eq.true" ? "*/40" : "*/1460" });

  assert.equal(await reabrirDesde("loja-a", "2026-07-15"), 1500);

  // Primeiro as que já estavam na fila: na ordem inversa, as que acabaram de voltar seriam pegas de novo.
  assert.deepEqual(chamadas.map((c) => [c.metodo, c.prefer.includes("count=exact"), filtros(c.url)]), [
    ["PATCH", true, { tenant_id: "eq.loja-a", pending: "eq.true", or: "(order_date.gte.2026-07-15,order_date.is.null)" }],
    ["PATCH", true, { tenant_id: "eq.loja-a", order_date: "gte.2026-07-15", pending: "eq.false" }],
  ]);
  // O `updated_at` novo invalida o processamento em andamento. As que já estavam na fila mantêm o `low_priority`
  // delas (a venda que o aviso acabou de marcar não vai para trás de 90 dias); as que voltam vão atrás dela.
  const [naFila, voltando] = chamadas.map((c) => semRelogio(c.corpo, "next_try_at", "updated_at"));
  assert.deepEqual(naFila, { attempts: 0, next_try_at: "agora", updated_at: "agora" });
  assert.deepEqual(voltando, { pending: true, low_priority: true, attempts: 0, next_try_at: "agora", updated_at: "agora" });
  for (const { corpo } of chamadas) assert.equal((corpo as Record<string, unknown>).next_try_at, (corpo as Record<string, unknown>).updated_at);
});

test("erro do banco sobe com a mensagem dele, em toda leitura e gravação", async () => {
  responder = () => ({ status: 500, corpo: { message: "caiu o banco" } });
  const chamadasDaStore: [string, () => Promise<unknown>][] = [
    ["enfileirarPedidos", () => enfileirarPedidos("loja-a", "aviso", [{ id: 1 }])],
    ["listarPendentes", () => listarPendentes("loja-a", AGORA, 20)],
    ["existePendenteVencido", () => existePendenteVencido("loja-a", AGORA)],
    ["salvarProcessado", () => salvarProcessado("loja-a", 101, VENDA, { pendente: false }, LIDO)],
    ["salvarEfeitos", () => salvarEfeitos("loja-a", 101, EFEITOS)],
    ["agendarNovaTentativa", () => agendarNovaTentativa("loja-a", 101, 1, AGORA, "x", LIDO)],
    ["reabrirDesde", () => reabrirDesde("loja-a", "2026-07-15")],
  ];
  for (const [nome, chamar] of chamadasDaStore) {
    await assert.rejects(chamar(), /caiu o banco/, nome);
  }
});

const RESUMO_DO_BANCO = {
  vendas_30d: 214,
  vendido_30d: 86420.5,
  origem_30d: { anuncio: 61, grupo: 97, sem_origem: 56 },
  meta_30d: { enviado: 207, fora_da_janela: 6, sem_pixel: 0, sem_dados: 1, desligado: 0, erro: 0 },
  pendentes: 3,
  falhas: 1,
  historico_lidos: 1840,
  listas: { alto_valor: 38, comprador: 412, lead: 129 },
};

test("resumo do cartão: um rpc bling_resumo da loja, conferido, e chave nova do SQL não derruba", async () => {
  responder = () => ({ status: 200, corpo: { ...RESUMO_DO_BANCO, novo_numero: 7 } });

  assert.deepEqual(await lerResumo("loja-a"), RESUMO_DO_BANCO);

  const [{ metodo, url, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["POST", "/rest/v1/rpc/bling_resumo"]);
  assert.deepEqual(corpo, { p_tenant: "loja-a" });
});

test("resumo torto estoura em vez de virar zero no cartão", async () => {
  const tortos = [
    { ...RESUMO_DO_BANCO, vendas_30d: "214" },
    { ...RESUMO_DO_BANCO, listas: undefined },
    { ...RESUMO_DO_BANCO, meta_30d: { ...RESUMO_DO_BANCO.meta_30d, erro: -1 } },
    null,
  ];
  for (const torto of tortos) {
    responder = () => ({ status: 200, corpo: torto });
    await assert.rejects(lerResumo("loja-a"), /bling_resumo: formato inesperado/, JSON.stringify(torto));
  }
});

test("últimas do cartão: só venda e pedido da loja, dia do pedido mais novo primeiro (sem dia por último), depois o id", async () => {
  const pedido = { ...LINHA_101, bling_order_id: "100", kind: "pedido", order_date: null };
  responder = () => ({ status: 200, corpo: [{ ...LINHA_101, kind: "venda" }, pedido] });

  const linhas = await ultimasDoCartao("loja-a", 8);

  assert.deepEqual(filtros(chamadas[0].url), {
    tenant_id: "eq.loja-a",
    kind: "in.(venda,pedido)",
    order: "order_date.desc.nullslast,bling_order_id.desc",
    limit: "8",
  });
  // Mesmo mapeamento da fila: número em texto vira número, retrato conferido.
  assert.deepEqual(
    linhas.map((l) => [l.blingOrderId, l.kind, l.orderDate, l.total, l.snapshot]),
    [
      [101, "venda", "2026-10-12", 149.9, RESUMO_A],
      [100, "pedido", null, 149.9, RESUMO_A],
    ],
  );
});

test("erro do banco no resumo e nas últimas sobe com a mensagem dele", async () => {
  responder = () => ({ status: 500, corpo: { message: "caiu o banco" } });
  await assert.rejects(lerResumo("loja-a"), /caiu o banco/);
  await assert.rejects(ultimasDoCartao("loja-a", 8), /caiu o banco/);
  await assert.rejects(pedidosComCanal("loja-a", 1000), /caiu o banco/);
});

test("pedidos com canal: só da loja, só retrato com canal (> 0 no jsonb), id mais alto primeiro; o que não é número some", async () => {
  responder = () => ({
    status: 200,
    corpo: [
      { numero: "1532", data: "2026-10-18", loja: 200000001 },
      { numero: null, data: null, loja: 200000002 },
      { numero: "9", data: "2026-10-01", loja: "200000003" },
      { numero: "8", data: "2026-10-01", loja: true },
    ],
  });

  const pedidos = await pedidosComCanal("loja-a", 1000);

  // Do retrato: o pedido na fila, ainda sem processar, ainda não tem número nem dia nas colunas.
  assert.equal(chamadas[0].url.searchParams.get("select"), "numero:snapshot->>numero,data:snapshot->>data,loja:snapshot->lojaId");
  assert.deepEqual(filtros(chamadas[0].url), {
    tenant_id: "eq.loja-a",
    // `->` compara jsonb: número > 0 passa; null, 0 e retrato sem a chave (antigo) ficam de fora.
    "snapshot->lojaId": "gt.0",
    order: "bling_order_id.desc",
    limit: "1000",
  });
  assert.deepEqual(pedidos, [
    { lojaId: 200000001, numero: "1532", orderDate: "2026-10-18" },
    { lojaId: 200000002, numero: null, orderDate: null },
  ]);
});
