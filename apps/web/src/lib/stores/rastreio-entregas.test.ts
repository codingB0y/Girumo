import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { docHmac } from "@/lib/rastreio/documento";
import type { FiltroDeEntregas } from "@/lib/rastreio/entregas";
import type * as Store from "./rastreio-entregas";

/** PostgREST falso (molde de `leads.test.ts`): a query é a de produção, só a rede é trocada. */

type Pedido = { metodo: string; url: URL; prefer: string };
type Resposta = { status: number; contentRange?: string; corpo?: unknown };

const PEPPER = "p".repeat(32);
const AGORA = new Date("2026-10-29T15:00:00.000Z");
const pedidos: Pedido[] = [];
let responder: (url: URL) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? "") });
  const { status, contentRange, corpo } = responder(url);
  if (contentRange) res.setHeader("Content-Range", contentRange);
  if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.RASTREIO_DOC_PEPPER = PEPPER;
  store = await import("./rastreio-entregas");
});

after(() => {
  postgrest.close();
});

/** Os filtros da query: sem select/order/offset/limit (o que a lista e o chip precisam ter igual). */
function filtros(url: URL): [string, string][] {
  return [...url.searchParams].filter(([k]) => !["select", "order", "offset", "limit"].includes(k));
}
const valores = (url: URL, chave: string) => url.searchParams.getAll(chave);

const consulta = (filtro: FiltroDeEntregas, extra: Partial<Parameters<typeof store.listarEntregas>[1]> = {}) => ({
  filtro, busca: null, pedidoId: null, pagina: 1, agora: AGORA, ...extra,
});

function pelaTabela(url: URL): Resposta {
  const p = url.searchParams;
  const total = (n: number): Resposta => ({ status: 200, contentRange: `*/${n}` });
  if (url.pathname.endsWith("/tracking_notices")) return total(p.get("channel") === "eq.whatsapp" ? 12 : 6);
  if ((p.get("select") ?? "").includes("tracking_notices")) return total(1);
  if (p.get("etapa") === "eq.entregue") return total(41);
  if (p.get("etapa") === "in.(enviado,retirada)") return total(23);
  if (p.get("etapa") === "eq.problema") return total(2);
  if (p.get("etapa") === "eq.separando") return total(4);
  if (p.get("or")) return total(29);
  return { status: 500 };
}

test("lista: loja, janela de 30 dias, ordem e página", async () => {
  pedidos.length = 0;
  responder = (url) => (url.pathname.endsWith("/tracking_orders") ? { status: 200, contentRange: "25-49/61", corpo: [] } : { status: 500 });
  const r = await store.listarEntregas("loja-a", consulta("todos", { pagina: 2 }));
  assert.equal(r.total, 61);
  assert.equal(pedidos.length, 1);
  const [p] = pedidos;
  assert.equal(p.metodo, "GET");
  assert.equal(p.url.pathname, "/rest/v1/tracking_orders");
  assert.deepEqual(valores(p.url, "tenant_id"), ["eq.loja-a"]);
  assert.ok(valores(p.url, "etapa_at").includes("gte.2026-09-29T15:00:00.000Z"));
  assert.equal(p.url.searchParams.get("order"), "etapa_at.desc");
  assert.equal(p.url.searchParams.get("offset"), "25");
  assert.equal(p.url.searchParams.get("limit"), "25");
  assert.match(p.prefer, /count=exact/);
});

test("cada filtro vira a condição da tabela, e o chip usa a mesma", async () => {
  const SEM_CODIGO = "invoiced,ready_for_shipping,on_carriage";
  const esperado: Record<string, [string, string][]> = {
    a_caminho: [["etapa", "in.(enviado,retirada)"]],
    problema: [["etapa", "eq.problema"]],
    entregues: [["etapa", "eq.entregue"]],
    sem_codigo: [
      ["etapa", "eq.separando"], ["tracking_code", "is.null"], ["status_raw", `in.(${SEM_CODIGO})`],
      ["etapa_at", "lte.2026-10-27T15:00:00.000Z"],
    ],
    todos: [[
      "or",
      `(etapa.in.(enviado,retirada,problema,entregue),and(etapa.eq.separando,tracking_code.is.null,status_raw.in.(${SEM_CODIGO}),etapa_at.lte.2026-10-27T15:00:00.000Z))`,
    ]],
  };
  const lista = async (f: FiltroDeEntregas) => {
    pedidos.length = 0;
    responder = () => ({ status: 200, contentRange: "*/0", corpo: [] });
    await store.listarEntregas("loja-a", consulta(f));
    return filtros(pedidos[0].url);
  };
  for (const [f, condicoes] of Object.entries(esperado)) {
    const da = await lista(f as FiltroDeEntregas);
    for (const c of condicoes) assert.ok(da.some(([k, v]) => k === c[0] && v === c[1]), `${f}: ${c.join("=")}`);
  }
  // o chip e a lista nunca discordam
  pedidos.length = 0;
  responder = pelaTabela;
  await store.numerosDasEntregas("loja-a", AGORA);
  const heads = pedidos.filter((p) => p.metodo === "HEAD" && p.url.pathname.endsWith("/tracking_orders"));
  const chip = (pred: (u: URL) => boolean) => filtros(heads.find((h) => pred(h.url))!.url);
  assert.deepEqual(await lista("a_caminho"), chip((u) => u.searchParams.get("etapa") === "in.(enviado,retirada)"));
  assert.deepEqual(await lista("problema"), chip((u) => u.searchParams.get("etapa") === "eq.problema" && !u.searchParams.get("select")?.includes("notices")));
  assert.deepEqual(await lista("sem_codigo"), chip((u) => u.searchParams.get("etapa") === "eq.separando"));
  assert.deepEqual(await lista("todos"), chip((u) => u.searchParams.has("or")));
  assert.deepEqual(await lista("whatsapp_falhou"), chip((u) => (u.searchParams.get("select") ?? "").includes("tracking_notices")));
});

test("WhatsApp falhou junta com os avisos da própria loja", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, contentRange: "*/0", corpo: [] });
  await store.listarEntregas("loja-a", consulta("whatsapp_falhou"));
  const { url } = pedidos[0];
  assert.match(url.searchParams.get("select") ?? "", /tracking_notices!inner\(id\)/);
  assert.deepEqual(valores(url, "tracking_notices.channel"), ["eq.whatsapp"]);
  assert.deepEqual(valores(url, "tracking_notices.status"), ["eq.falhou"]);
  assert.deepEqual(valores(url, "tracking_notices.tenant_id"), ["eq.loja-a"]);
});

test("busca: documento, número ou primeiro nome", async () => {
  const buscar = async (busca: string) => {
    pedidos.length = 0;
    responder = () => ({ status: 200, contentRange: "*/0", corpo: [] });
    await store.listarEntregas("loja-a", consulta("todos", { busca }));
    return pedidos[0].url;
  };
  const doc = await buscar("111.444.777-35");
  assert.deepEqual(valores(doc, "doc_hmac"), [`eq.${docHmac("11144477735", PEPPER)}`]);
  assert.equal(doc.searchParams.has("numero"), false);
  assert.equal(doc.searchParams.has("buyer_first_name"), false);
  assert.deepEqual(valores(await buscar("#1541"), "numero"), ["ilike.1541%"]);
  assert.deepEqual(valores(await buscar("Ana Paula"), "buyer_first_name"), ["ilike.Ana%"]);
  assert.deepEqual(valores(await buscar("50%_x"), "buyer_first_name"), ["ilike.50\\%\\_x%"]);
});

test("documento sem pepper falha sem consultar o banco", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, contentRange: "*/0", corpo: [] });
  delete process.env.RASTREIO_DOC_PEPPER;
  try {
    await assert.rejects(store.listarEntregas("loja-a", consulta("todos", { busca: "11144477735" })), /RASTREIO_DOC_PEPPER/);
  } finally {
    process.env.RASTREIO_DOC_PEPPER = PEPPER;
  }
  assert.equal(pedidos.length, 0);
});

test("pedido do sininho: só loja e id, sem janela", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, contentRange: "*/0", corpo: [] });
  const id = "6f1c2c1e-0000-4000-8000-000000000001";
  await store.listarEntregas("loja-a", consulta("entregues", { pedidoId: id, busca: "Ana" }));
  const f = filtros(pedidos[0].url);
  assert.deepEqual(f, [["tenant_id", "eq.loja-a"], ["id", `eq.${id}`]]);
});

test("avisos da página numa consulta só", async () => {
  pedidos.length = 0;
  const linha = (id: string) => ({
    id, numero: "1541", buyer_first_name: "Ana", buyer_phone: "5511987654321", etapa: "enviado",
    etapa_at: "2026-10-28T10:00:00.000Z", tracking_code: "BR1", status_raw: "on_carriage", link_token: "tok",
  });
  responder = (url) =>
    url.pathname.endsWith("/tracking_orders")
      ? { status: 200, contentRange: "0-1/2", corpo: [linha("p1"), linha("p2")] }
      : { status: 200, corpo: [{ order_id: "p1", etapa: "enviado", channel: "whatsapp", status: "falhou" }] };
  const r = await store.listarEntregas("loja-a", consulta("todos"));
  assert.equal(pedidos.length, 2);
  const avisos = pedidos[1].url;
  assert.equal(avisos.pathname, "/rest/v1/tracking_notices");
  assert.deepEqual(valores(avisos, "tenant_id"), ["eq.loja-a"]);
  assert.deepEqual(valores(avisos, "order_id"), ["in.(p1,p2)"]);
  assert.deepEqual(r.avisos, [{ orderId: "p1", etapa: "enviado", canal: "whatsapp", status: "falhou" }]);
  assert.equal(r.pedidos[0].buyerFirstName, "Ana");
  assert.equal(r.pedidos[0].linkToken, "tok");

  pedidos.length = 0;
  responder = () => ({ status: 200, contentRange: "*/0", corpo: [] });
  const vazia = await store.listarEntregas("loja-a", consulta("todos"));
  assert.equal(pedidos.length, 1);
  assert.deepEqual(vazia.avisos, []);
});

test("números do topo", async () => {
  pedidos.length = 0;
  responder = pelaTabela;
  const n = await store.numerosDasEntregas("loja-a", AGORA);
  assert.deepEqual(n, { todos: 29, aCaminho: 23, semCodigo: 4, problema: 2, whatsappFalhou: 1, entreguesEm7Dias: 41, avisosHoje: { whatsapp: 12, email: 6 } });
  assert.equal(pedidos.length, 8);
  for (const p of pedidos) {
    assert.equal(p.metodo, "HEAD");
    assert.deepEqual(valores(p.url, "tenant_id"), ["eq.loja-a"]);
    assert.match(p.prefer, /count=exact/);
  }
  const entregues = pedidos.find((p) => p.url.searchParams.get("etapa") === "eq.entregue")!;
  assert.deepEqual(valores(entregues.url, "etapa_at"), ["gte.2026-10-22T15:00:00.000Z"]);
  const avisos = pedidos.filter((p) => p.url.pathname.endsWith("/tracking_notices"));
  assert.equal(avisos.length, 2);
  for (const a of avisos) {
    assert.deepEqual(valores(a.url, "status"), ["in.(enviado,entregue,lido)"]);
    assert.deepEqual(valores(a.url, "sent_at"), ["gte.2026-10-29T03:00:00.000Z"]);
  }

  // ainda 28/10 em Brasília: o dia começa às 03:00Z do dia 28 (mutante: meia-noite UTC)
  pedidos.length = 0;
  await store.numerosDasEntregas("loja-a", new Date("2026-10-29T02:30:00.000Z"));
  const ontem = pedidos.filter((p) => p.url.pathname.endsWith("/tracking_notices"));
  assert.deepEqual(valores(ontem[0].url, "sent_at"), ["gte.2026-10-28T03:00:00.000Z"]);
});

test("contagem que não veio é erro, nunca zero", async () => {
  responder = () => ({ status: 404 });
  await assert.rejects(store.numerosDasEntregas("loja-a", AGORA), /204/);
});

test("saúde do código", async () => {
  pedidos.length = 0;
  responder = (url) => {
    if (url.searchParams.get("order")) return { status: 200, corpo: [{ id: "p9", numero: "1539", etapa_at: "2026-10-25T15:00:00.000Z" }] };
    return { status: 200, contentRange: url.searchParams.has("tracking_code") ? "*/14" : "*/15" };
  };
  const s = await store.saudeDoCodigo("loja-a", AGORA);
  assert.deepEqual(s, { enviados: 15, comCodigo: 14, maisAntigoSemCodigo: { id: "p9", numero: "1539", desde: "2026-10-25T15:00:00.000Z" } });
  const heads = pedidos.filter((p) => p.metodo === "HEAD");
  assert.equal(heads.length, 2);
  for (const h of heads) {
    assert.deepEqual(valores(h.url, "tenant_id"), ["eq.loja-a"]);
    assert.deepEqual(valores(h.url, "or"), ["(etapa.in.(enviado,retirada,problema,entregue),and(etapa.eq.separando,status_raw.eq.on_carriage))"]);
    assert.deepEqual(valores(h.url, "etapa_at"), ["gte.2026-10-22T15:00:00.000Z"]);
  }
  assert.ok(heads.some((h) => valores(h.url, "tracking_code").includes("not.is.null")));
  const antigo = pedidos.find((p) => p.url.searchParams.get("order"))!.url;
  assert.equal(antigo.searchParams.get("order"), "etapa_at.asc");
  assert.equal(antigo.searchParams.get("limit"), "1");
  assert.deepEqual(valores(antigo, "tracking_code"), ["is.null"]);
  assert.deepEqual(valores(antigo, "etapa"), ["eq.separando"]);

  responder = (url) => (url.searchParams.get("order") ? { status: 200, corpo: [] } : { status: 200, contentRange: "*/0" });
  assert.equal((await store.saudeDoCodigo("loja-a", AGORA)).maisAntigoSemCodigo, null);
});

test("lista sem Content-Range é erro, nunca total zero", async () => {
  responder = () => ({ status: 200, corpo: [] });
  await assert.rejects(store.listarEntregas("loja-a", consulta("todos")), /sem contagem/);
});
