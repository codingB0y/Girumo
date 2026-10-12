import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { dayBR } from "@/lib/date-br";
import { diasEntre } from "@/lib/resultados/periodo-anuncios";
import { GET } from "./route";

/** Dono logado por Bearer (mesmo molde de api/integracoes/site/chave/route.test.ts). */

const RELATORIO = {
  periodo: { de: "2026-09-11", ate: "2026-10-10" },
  total: { cadastros: 6, foram: 5, entraram: 4, ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: 250 },
  linhas: [
    { nivel: "campanha", campanha: "C1", conjunto: null, anuncio: null, cadastros: 6, foram: 5, entraram: 4,
      ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: 160 },
    { nivel: "anuncio", campanha: "C1", conjunto: "S1", anuncio: "A1", cadastros: 6, foram: 5, entraram: 4,
      ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: null },
    { nivel: "campanha", campanha: "Só gasto", conjunto: null, anuncio: null, cadastros: 0, foram: 0, entraram: 0,
      ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0, gasto: 90 },
  ],
  por_origem: [{ origem: "ig", cadastros: 6, vendido: 1300 }],
  por_dia: [{ dia: "2026-10-10", cadastros: 6, entraram: 4 }],
  fora: { entradas_sem_cadastro: 2, pedidos_sem_origem: 1, vendido_sem_origem: 90 },
};
const ZERADO = {
  ...RELATORIO,
  total: { ...RELATORIO.total, cadastros: 0, foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0 },
  linhas: [],
  por_origem: [],
};

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let rpc: { status: number; corpo: unknown } = { status: 200, corpo: RELATORIO };
let capturasDoSite: unknown[] = [];
let capturasDePagina: unknown[] = [];

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel, modules: [] }]];
    else if (chave === "POST /rest/v1/rpc/attribution_report") [status, corpo] = [rpc.status, rpc.corpo];
    else if (chave === "GET /rest/v1/site_captures") [status, corpo] = [200, capturasDoSite];
    else if (chave === "GET /rest/v1/lp_captures") [status, corpo] = [200, capturasDePagina];
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
});
after(() => {
  supabase.close();
});
beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  rpc = { status: 200, corpo: RELATORIO };
  capturasDoSite = [];
  capturasDePagina = [];
});

function pedir(busca: string): Request {
  return new Request(`http://girumo.test/api/resultados/anuncios${busca}`, {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}
const doRpc = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/attribution_report");
const dasCapturas = () =>
  chamadas.filter((c) => c.url.pathname === "/rest/v1/site_captures" || c.url.pathname === "/rest/v1/lp_captures");

test("dono: 200 com o relatório; o tenant do RPC é o da sessão, nunca o da query string", async () => {
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10&tenant_id=loja-x&p_tenant=loja-x"));
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();
  assert.equal(corpo.tem_cadastro, true);
  assert.equal(corpo.relatorio.total.cadastros, 6);
  // Dono tem ads:manage: o gasto vem inteiro.
  assert.equal(corpo.relatorio.total.gasto, 250);
  assert.deepEqual(corpo.relatorio.linhas.map((l: { gasto: number | null }) => l.gasto), [160, null, 90]);
  assert.deepEqual(doRpc()[0]?.corpo, { p_tenant: "loja-b", p_de: "2026-09-11", p_ate: "2026-10-10" });
  // Cadastro no período já prova que existe: nada de consulta extra.
  assert.equal(dasCapturas().length, 0);
});

test("operador lê o funil sem nenhum gasto: nem total, nem linha, nem a campanha que só tinha gasto", async () => {
  papel = "operator";
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.equal(corpo.relatorio.total.gasto, null);
  assert.equal(corpo.relatorio.total.vendido, 1300);
  assert.deepEqual(corpo.relatorio.linhas.map((l: { gasto: number | null }) => l.gasto), [null, null]);
  assert.doesNotMatch(JSON.stringify(corpo), /"gasto":\d|Só gasto/);
});

test("admin vê o gasto", async () => {
  papel = "admin";
  assert.equal((await (await GET(pedir("?de=2026-09-11&ate=2026-10-10"))).json()).relatorio.total.gasto, 250);
});

test("vendedora: 403 do guard de módulo e o RPC nunca roda", async () => {
  papel = "seller";
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 403);
  assert.equal(doRpc().length, 0);
});

test("período zerado: confere se a loja já teve cadastro, nas duas fontes e filtrando a loja", async () => {
  rpc = { status: 200, corpo: ZERADO };
  let corpo = await (await GET(pedir("?de=2026-09-11&ate=2026-10-10"))).json();
  assert.equal(corpo.tem_cadastro, false);
  const consultas = dasCapturas();
  assert.equal(consultas.length, 2);
  for (const c of consultas) {
    assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b");
    assert.equal(c.url.searchParams.get("limit"), "1");
  }

  capturasDePagina = [{ id: "c1" }];
  corpo = await (await GET(pedir("?de=2026-09-11&ate=2026-10-10"))).json();
  assert.equal(corpo.tem_cadastro, true);
});

test("sem datas: últimos 30 dias em Brasília, contando hoje", async () => {
  assert.equal((await GET(pedir(""))).status, 200);
  const enviado = doRpc()[0]?.corpo as { p_de: string; p_ate: string };
  assert.equal(enviado.p_ate, dayBR());
  assert.equal(diasEntre(enviado.p_de, enviado.p_ate), 29);
});

test("datas ruins: 400 com mensagem e o banco não é consultado", async () => {
  for (const busca of ["?de=2026-10-01", "?de=2026-02-30&ate=2026-03-10", "?de=2026-10-10&ate=2026-09-01", "?de=2024-01-01&ate=2026-01-01"]) {
    chamadas.length = 0;
    const resposta = await GET(pedir(busca));
    assert.equal(resposta.status, 400, busca);
    assert.equal(typeof (await resposta.json()).error, "string");
    assert.equal(doRpc().length, 0, busca);
  }
});

test("o banco recusa o período (22023): 400, não 500", async () => {
  rpc = { status: 400, corpo: { code: "22023", message: "periodo invalido", details: null, hint: null } };
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), { error: "Período inválido." });
});

test("erro do banco ou formato quebrado: 500 sem vazar a mensagem do banco", async () => {
  rpc = { status: 401, corpo: { code: "42501", message: "permission denied for function attribution_report" } };
  let resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /permission|attribution_report/);

  rpc = { status: 200, corpo: { ...RELATORIO, total: { ...RELATORIO.total, cadastros: "6" } } };
  resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: "Não deu para montar o funil dos anúncios." });
});

test("vendido negativo (pedido de estorno) não derruba a aba", async () => {
  rpc = { status: 200, corpo: { ...RELATORIO, total: { ...RELATORIO.total, vendido: -40 } } };
  const resposta = await GET(pedir("?de=2026-09-11&ate=2026-10-10"));
  assert.equal(resposta.status, 200);
  assert.equal((await resposta.json()).relatorio.total.vendido, -40);
});
