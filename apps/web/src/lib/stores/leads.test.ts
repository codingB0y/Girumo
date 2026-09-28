import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { carregarContagemDeLeads as CarregarContagem } from "@/lib/painel/inicio-carga";
import { countEntriesByGroupSince, countEntriesSince, countLeads, listLatestEntries } from "./leads";

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

test("conta a loja inteira e quem comprou no banco, sem parar nas 1000 linhas", async () => {
  pedidos.length = 0;
  responder = (url) => ({
    status: 200,
    contentRange: url.searchParams.get("status") === "eq.comprou" ? "*/42" : "*/1503",
  });

  // Mutantes: trocar os dois campos de lugar, contar a lista (GET, que para em
  // 1000) ou esquecer um dos filtros.
  assert.deepEqual(await carregarContagemDeLeads("loja-a"), { total: 1503, clientes: 42 });

  assert.equal(pedidos.length, 2);
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
  assert.deepEqual(porQuantidadeDeFiltros, [
    { tenant_id: "eq.loja-a" },
    { tenant_id: "eq.loja-a", status: "eq.comprou" },
  ]);
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

test("novas de hoje por grupo: pagina até a página incompleta e soma acima de 1000", async () => {
  pedidos.length = 0;
  const linhas = (grupo: string, n: number) => Array.from({ length: n }, () => ({ source_group_id: grupo }));
  // 1001 entradas: a 1ª página vem cheia, no teto do PostgREST, e a 2ª traz a que sobrou.
  responder = (url) => ({
    status: 200,
    corpo: url.searchParams.get("offset") === "0" ? [...linhas("a@g.us", 700), ...linhas("b@g.us", 300)] : linhas("b@g.us", 1),
  });

  // Mutante: parar na 1ª página daria b = 300.
  const porGrupo = await countEntriesByGroupSince("loja-a", ["a@g.us", "b@g.us"], "2026-09-28T03:00:00.000Z");
  assert.deepEqual(Object.fromEntries(porGrupo), { "a@g.us": 700, "b@g.us": 301 });

  assert.deepEqual(
    pedidos.map((p) => [p.metodo, p.url.pathname, p.url.searchParams.get("offset")]),
    [
      ["GET", "/rest/v1/leads", "0"],
      ["GET", "/rest/v1/leads", "1000"],
    ],
  );
  // Sem o tenant, o service-role conta todas as lojas; sem a ordem, uma página pode repetir a outra.
  assert.deepEqual(filtros(pedidos[0].url), {
    tenant_id: "eq.loja-a",
    source_group_id: "in.(a@g.us,b@g.us)",
    entered_at: "gte.2026-09-28T03:00:00.000Z",
    order: "id.asc",
    offset: "0",
    limit: "1000",
  });
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
