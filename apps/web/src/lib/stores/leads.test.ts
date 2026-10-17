import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { carregarContagemDeLeads as CarregarContagem } from "@/lib/painel/inicio-carga";
import {
  countEntriesBetween,
  countEntriesSince,
  countLeads,
  entradasEntre,
  listLatestEntries,
  listLeadsPage,
} from "./leads";

/**
 * O cliente real do Supabase conversando com um PostgREST de mentira: a query
 * que sai daqui é a de produção, só a rede é trocada. O teste de integração
 * (`leads.integration.test.ts`) precisa de credencial de dev, que nem esta
 * máquina nem o CI têm; este roda em todo lugar.
 *
 * As respostas imitam o postgrest-js 2.108.2 (`processResponse`): HEAD não tem
 * corpo, a contagem vem no `Content-Range`, um 404 vazio volta como 204 sem
 * contagem e um 500 volta com `error.message` vazio. GET traz as linhas no corpo.
 */

type Pedido = { metodo: string; url: URL; prefer: string };
type Resposta = { status: number; contentRange?: string; corpo?: unknown };

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

let carregarContagemDeLeads: typeof CarregarContagem;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // O loader escolhe entre banco e JSON na importação; a conta testada é a do banco.
  process.env.HUBFLOW_USE_SUPABASE = "1";
  ({ carregarContagemDeLeads } = await import("@/lib/painel/inicio-carga"));
});

after(() => {
  postgrest.close();
});

/** Os filtros da query, sem o `select`. */
function filtros(url: URL): Record<string, string> {
  return Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));
}

test("conta a loja inteira e cada status no banco, sem parar nas 1000 linhas", async () => {
  pedidos.length = 0;
  const porStatus: Record<string, string> = { "eq.comprou": "*/42", "eq.novo": "*/1200", "eq.ativo": "*/261" };
  responder = (url) => ({ status: 200, contentRange: porStatus[url.searchParams.get("status") ?? ""] ?? "*/1503" });

  // Mutantes: trocar os campos de lugar, contar a lista (GET, que para em
  // 1000) ou esquecer um dos filtros.
  assert.deepEqual(await carregarContagemDeLeads("loja-a"), { total: 1503, clientes: 42, novos: 1200, ativos: 261 });

  assert.equal(pedidos.length, 4);
  for (const pedido of pedidos) {
    assert.equal(pedido.metodo, "HEAD");
    assert.equal(pedido.url.pathname, "/rest/v1/leads");
    assert.match(pedido.prefer, /count=exact/);
  }
  // O service-role passa por cima do RLS: sem o filtro de tenant, a conta é a
  // de todas as lojas.
  const porQuantidadeDeFiltros = pedidos
    .map((p) => filtros(p.url))
    .sort((a, b) => Object.keys(a).length - Object.keys(b).length);
  assert.deepEqual(porQuantidadeDeFiltros.slice(0, 1), [{ tenant_id: "eq.loja-a" }]);
  assert.deepEqual(
    porQuantidadeDeFiltros
      .slice(1)
      .map((f) => f.status)
      .sort(),
    ["eq.ativo", "eq.comprou", "eq.novo"],
  );
  for (const f of porQuantidadeDeFiltros) assert.equal(f.tenant_id, "eq.loja-a");
});

test("zero medido continua zero", async () => {
  // Mutante: tratar todo falsy como falha deixaria a loja nova em "—" para sempre.
  responder = () => ({ status: 200, contentRange: "*/0" });
  assert.equal(await countLeads("loja-a"), 0);
  assert.equal(await countLeads("loja-a", "comprou"), 0);
});

test("contagem que não veio é erro, nunca um zero que ninguém mediu", async () => {
  // 404 de corpo vazio: o postgrest-js devolve 204 com `error` e `count` nulos.
  // Mutante: `count ?? 0`, que era o countLeads antes deste teste.
  responder = () => ({ status: 404 });
  await assert.rejects(countLeads("loja-a"), /204/);
  await assert.rejects(countLeads("loja-a", "comprou"), /204/);
  await assert.rejects(countEntriesSince("loja-a", ["grupo@g.us"], "2026-09-01T00:00:00.000Z"), /204/);

  // 500: HEAD não tem corpo, então o erro chega com mensagem vazia. O status é
  // o que sobra para o log dizer o que aconteceu.
  responder = () => ({ status: 500 });
  await assert.rejects(countLeads("loja-a"), /HTTP 500/);
  await assert.rejects(carregarContagemDeLeads("loja-a"), /HTTP 500/);

  // `*/*`: o postgrest-js faz parseInt("*") e devolve NaN, que passa por
  // `count === null` e vira `null` no JSON da rota sem ninguém saber por quê.
  responder = () => ({ status: 200, contentRange: "*/*" });
  await assert.rejects(countLeads("loja-a"), /sem contagem/);
});

test("últimas entradas: loja e grupos filtrados no banco, a mais nova primeiro, sem telefone", async () => {
  pedidos.length = 0;
  const linha = { id: "l1", name: null, source_group_name: "VIP #40", entered_at: "2026-09-28T12:05:00+00:00" };
  responder = () => ({ status: 200, corpo: [linha] });

  assert.deepEqual(await listLatestEntries("loja-a", ["a@g.us"], 5), [linha]);

  assert.equal(pedidos.length, 1);
  const [{ metodo, url }] = pedidos;
  assert.equal(metodo, "GET");
  assert.equal(url.pathname, "/rest/v1/leads");
  // Mutantes: `select *` traria o telefone; filtrar os grupos depois, no JS, é o bug da campanha quieta.
  assert.equal(url.searchParams.get("select"), "id,name,source_group_name,entered_at");
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    source_group_id: "in.(a@g.us)",
    order: "entered_at.desc",
    limit: "5",
  });
});

test("página de contatos: loja, status, busca por nome e a fatia pedida, no banco", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: [] });

  await listLeadsPage("loja-a", { status: "comprou", q: " 50%_off \\ ", offset: 50, limit: 50 });

  assert.equal(pedidos.length, 1);
  const [{ metodo, url }] = pedidos;
  assert.equal(metodo, "GET");
  assert.equal(url.pathname, "/rest/v1/leads");
  // Mutantes: busca no navegador (só sobre os 1000 mais recentes), `%` e `_`
  // digitados virando curinga, ordem instável entre páginas, fatia ignorada.
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    status: "eq.comprou",
    name: "ilike.%50\\%\\_off \\\\%",
    order: "entered_at.desc,id.asc",
    offset: "50",
    limit: "50",
  });
});

test("página de contatos: sem letra, a busca é pelos dígitos do telefone como aparece na ficha", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: [] });

  await listLeadsPage("loja-a", { q: "+55 11 98765-4321", offset: 0, limit: 50 });
  // Só pontuação não tem dígito: vale como nome, igual à busca da tela.
  await listLeadsPage("loja-a", { q: "-", offset: 0, limit: 50 });
  // Sem busca e sem status, só a loja.
  await listLeadsPage("loja-a", { q: "  ", offset: 0, limit: 50 });

  const [telefone, pontuacao, todos] = pedidos.map((p) => filtros(p.url));
  assert.equal(telefone.phone, "like.%5511987654321%");
  assert.equal(telefone.name, undefined);
  assert.equal(pontuacao.name, "ilike.%-%");
  assert.deepEqual(todos, { tenant_id: "eq.loja-a", order: "entered_at.desc,id.asc", offset: "0", limit: "50" });
});

test("página de contatos: erro do banco é erro, nunca uma loja vazia", async () => {
  responder = () => ({ status: 500, corpo: { message: "caiu" } });
  await assert.rejects(listLeadsPage("loja-a", { offset: 0, limit: 50 }), /caiu/);
});

test("entradas da semana: pagina além das 1000 linhas e conta por grupo", async () => {
  pedidos.length = 0;
  const linhas = [
    ...Array.from({ length: 900 }, () => ({ source_group_name: "VIP #1" })),
    ...Array.from({ length: 590 }, () => ({ source_group_name: "VIP #2" })),
    ...Array.from({ length: 8 }, () => ({ source_group_name: null })),
  ];
  responder = (url) => {
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return { status: 200, corpo: linhas.slice(offset, offset + limit) };
  };

  // Mutante: `.length` da primeira resposta, que era o "1000 novos contatos" do e-mail.
  const { total, porGrupo } = await entradasEntre("loja-a", "2026-10-05T03:00:00.000Z", "2026-10-12T03:00:00.000Z");
  assert.equal(total, 1498);
  assert.deepEqual([...porGrupo].sort(), [
    ["VIP #1", 900],
    ["VIP #2", 590],
  ]);

  // Cada página começa onde a anterior parou; a vazia é que encerra.
  assert.deepEqual(
    pedidos.map((p) => p.url.searchParams.get("offset")),
    ["0", "1000", "1498"],
  );
  for (const p of pedidos) {
    assert.equal(p.url.searchParams.get("select"), "source_group_name");
    assert.deepEqual(p.url.searchParams.getAll("entered_at"), [
      "gte.2026-10-05T03:00:00.000Z",
      "lt.2026-10-12T03:00:00.000Z",
    ]);
    assert.equal(p.url.searchParams.get("tenant_id"), "eq.loja-a");
    // Sem ordem total, duas páginas podem repetir ou pular linhas.
    assert.equal(p.url.searchParams.get("order"), "id.asc");
    assert.equal(p.url.searchParams.get("limit"), "1000");
  }
});

test("entradas da semana: erro do banco é erro, nunca zero entradas", async () => {
  responder = () => ({ status: 500, corpo: { message: "caiu" } });
  await assert.rejects(entradasEntre("loja-a", "2026-10-05T03:00:00.000Z", "2026-10-12T03:00:00.000Z"), /caiu/);
});

test("entradas entre duas datas contadas no banco (head+count)", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, contentRange: "*/1137" });
  assert.equal(await countEntriesBetween("loja-a", "2026-09-28T03:00:00.000Z", "2026-10-05T03:00:00.000Z"), 1137);
  const [{ metodo, url }] = pedidos;
  assert.equal(metodo, "HEAD");
  assert.equal(url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.deepEqual(url.searchParams.getAll("entered_at"), [
    "gte.2026-09-28T03:00:00.000Z",
    "lt.2026-10-05T03:00:00.000Z",
  ]);

  responder = () => ({ status: 500 });
  await assert.rejects(
    countEntriesBetween("loja-a", "2026-09-28T03:00:00.000Z", "2026-10-05T03:00:00.000Z"),
    /HTTP 500/,
  );
});
