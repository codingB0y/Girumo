import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { dayBR } from "@/lib/date-br";
import { somarDias } from "@/lib/resultados/periodo-anuncios";
import { DELETE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

/** Dono logado por Bearer contra um Supabase de mentira (molde: api/integracoes/site/chave/route.test.ts). */

const L1 = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const L2 = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d";

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let falhar = false;
/** Só o relatório fora (os lançamentos respondem). */
let relatorioFora = false;
/** O que PATCH e DELETE devolvem: vazio = o id não é desta loja (o filtro de tenant não achou). */
let alteradas: unknown[] = [];

const LANCAMENTOS = [
  { id: L1, utm_campaign: "Remarketing", starts_on: "2026-10-01", ends_on: "2026-10-10", amount: 240 },
  // numeric pode chegar como texto: o store converte.
  { id: L2, utm_campaign: "VIP Atacado — Goiânia", starts_on: "2026-09-11", ends_on: "2026-10-10", amount: "1620.00" },
];
const ZERO = { foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0 };
const RELATORIO = {
  periodo: { de: "2025-09-06", ate: "2026-10-11" },
  total: { ...ZERO, cadastros: 4, gasto: 0 },
  linhas: [
    { nivel: "campanha", campanha: "VIP Atacado — Goiânia", conjunto: null, anuncio: null, ...ZERO, cadastros: 2, gasto: 0 },
    { nivel: "conjunto", campanha: "VIP Atacado — Goiânia", conjunto: "Mulheres 25-45", anuncio: null, ...ZERO, cadastros: 2, gasto: null },
    { nivel: "campanha", campanha: "Brasil", conjunto: null, anuncio: null, ...ZERO, cadastros: 1, gasto: null },
    { nivel: "campanha", campanha: null, conjunto: null, anuncio: null, ...ZERO, cadastros: 1, gasto: null },
  ],
  por_origem: [],
  por_dia: [],
  fora: { entradas_sem_cadastro: 0, pedidos_sem_origem: 0, vendido_sem_origem: 0 },
};

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpoPedido: unknown = bruto ? JSON.parse(bruto) : undefined;
    chamadas.push({ metodo: req.method ?? "", url, corpo: corpoPedido });
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel, modules: [] }]];
    else if (falhar) [status, corpo] = [500, { code: "XX000", message: "segredo do banco" }];
    else if (chave === "POST /rest/v1/rpc/attribution_report") {
      [status, corpo] = relatorioFora ? [500, { code: "XX000", message: "segredo do banco" }] : [200, RELATORIO];
    }
    else if (chave === "GET /rest/v1/ad_spend") [status, corpo] = [200, LANCAMENTOS];
    else if (chave === "POST /rest/v1/ad_spend") [status, corpo] = [201, { id: L1, ...(corpoPedido as object) }];
    else if (chave === "PATCH /rest/v1/ad_spend" || chave === "DELETE /rest/v1/ad_spend") [status, corpo] = [200, alteradas];
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
after(() => { supabase.close(); });
beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  falhar = false;
  relatorioFora = false;
  alteradas = [];
});

function pedir(metodo: string, caminho = "/api/anuncios/gasto", corpo?: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}
const comId = (id: string) => ({ params: Promise.resolve({ id }) });
const noGasto = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/ad_spend" || c.url.pathname.startsWith("/rest/v1/rpc/"));
const escrita = (metodo: string) => chamadas.filter((c) => c.metodo === metodo && c.url.pathname === "/rest/v1/ad_spend");
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

const BOM = { utm_campaign: "VIP Atacado — Goiânia", amount: 1620, starts_on: "2026-09-11", ends_on: "2026-10-10" };

test("GET: dono recebe os lançamentos da loja e as campanhas do relatório dos últimos 400 dias", async () => {
  // A rota lê o relógio sozinha: perto da meia-noite de Brasília o dia pode virar no meio do teste.
  const antes = dayBR(new Date());
  const r = await GET(pedir("GET"));
  const depois = dayBR(new Date());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const corpo = await r.json();
  assert.deepEqual(
    corpo.lancamentos.map((l: { id: string; amount: number }) => [l.id, l.amount]),
    [[L1, 240], [L2, 1620]],
  );
  // Nível campanha, sem a "(sem UTM)", unido aos nomes já lançados ("Remarketing" não está no relatório).
  assert.deepEqual(corpo.campanhas, ["Brasil", "Remarketing", "VIP Atacado — Goiânia"]);

  const lista = chamadas.find((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/ad_spend");
  assert.equal(lista?.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(lista?.url.searchParams.get("limit"), "500");
  const rpc = chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/attribution_report");
  const { p_tenant, p_de, p_ate } = rpc?.corpo as { p_tenant: string; p_de: string; p_ate: string };
  assert.equal(p_tenant, "loja-b");
  // Hoje, ou ontem se a meia-noite passou entre a rota e o fim do teste.
  assert.ok(p_ate === antes || p_ate === depois, `p_ate ${p_ate} fora de ${antes}..${depois}`);
  assert.equal(p_de, somarDias(p_ate, -400));
});

test("GET com o relatório fora: os lançamentos saem, e o seletor fica com os nomes já lançados", async () => {
  relatorioFora = true;
  const r = await GET(pedir("GET"));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.lancamentos.length, 2);
  assert.deepEqual(corpo.campanhas, ["Remarketing", "VIP Atacado — Goiânia"]);
  assert.doesNotMatch(JSON.stringify(corpo), /segredo/);
});

test("POST: grava na loja da sessão, com a campanha aparada e quem lançou", async () => {
  const r = await POST(pedir("POST", undefined, { ...BOM, utm_campaign: "  VIP Atacado — Goiânia  " }));
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { id: L1, ...BOM });
  assert.deepEqual(escrita("POST")[0]?.corpo, { ...BOM, tenant_id: "loja-b", created_by: "usuario-1" });
});

test("POST apara só espaço das pontas, como o btrim do relatório: tab na ponta fica", async () => {
  const r = await POST(pedir("POST", undefined, { ...BOM, utm_campaign: "	Black Friday " }));
  assert.equal(r.status, 201);
  assert.equal((escrita("POST")[0]?.corpo as { utm_campaign: string }).utm_campaign, "	Black Friday");
});

test("POST de campanha que ainda não chegou é aceito (spec §6: vira linha só com gasto no relatório)", async () => {
  const r = await POST(pedir("POST", undefined, { ...BOM, utm_campaign: "Black Friday" }));
  assert.equal(r.status, 201);
  assert.equal((escrita("POST")[0]?.corpo as { utm_campaign: string }).utm_campaign, "Black Friday");
});

test("POST aceita os limites exatos do check: R$ 10 milhões, 200 caracteres, um dia só", async () => {
  const r = await POST(pedir("POST", undefined, {
    utm_campaign: "x".repeat(200), amount: 10_000_000, starts_on: "2026-10-10", ends_on: "2026-10-10",
  }));
  assert.equal(r.status, 201);
});

test("POST recusa o que o check da tabela recusaria (400, nada gravado), e campo a mais", async () => {
  const ruins: unknown[] = [
    { ...BOM, utm_campaign: "   " },
    { ...BOM, utm_campaign: "x".repeat(201) },
    { ...BOM, amount: 0 },
    { ...BOM, amount: -5 },
    { ...BOM, amount: 0.004 },
    { ...BOM, amount: 10_000_000.01 },
    { ...BOM, amount: "1620" },
    { ...BOM, starts_on: "2026-02-30" },
    { ...BOM, ends_on: "10/10/2026" },
    { ...BOM, ends_on: "2026-09-10" },
    { ...BOM, tenant_id: "loja-a" },
    { utm_campaign: "C1", amount: 100, starts_on: "2026-10-01" },
    "não é json",
  ];
  for (const corpo of ruins) {
    const r = await POST(pedir("POST", undefined, corpo));
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(typeof (await r.json()).error, "string");
  }
  assert.equal(escrita("POST").length, 0);
});

test("PATCH: troca os quatro campos do lançamento DESTA loja, filtrando tenant e id", async () => {
  alteradas = [{ id: L1, ...BOM, amount: 980 }];
  const r = await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, { ...BOM, amount: 980 }), comId(L1));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { id: L1, ...BOM, amount: 980 });
  const patch = escrita("PATCH")[0];
  assert.deepEqual(filtros(patch.url), { tenant_id: "eq.loja-b", id: `eq.${L1}` });
  const gravado = patch.corpo as Record<string, unknown>;
  assert.equal("tenant_id" in gravado, false);
  assert.match(String(gravado.updated_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual({ ...gravado, updated_at: undefined }, { ...BOM, amount: 980, updated_at: undefined });
});

test("PATCH e DELETE de id de outra loja: 404, e a query levou o tenant", async () => {
  alteradas = [];
  assert.equal((await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L2}`, BOM), comId(L2))).status, 404);
  assert.equal((await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L2}`), comId(L2))).status, 404);
  for (const c of [...escrita("PATCH"), ...escrita("DELETE")]) {
    assert.deepEqual(filtros(c.url), { tenant_id: "eq.loja-b", id: `eq.${L2}` });
  }
});

test("PATCH e DELETE com id que não é uuid: 404 sem tocar o banco; PATCH com corpo ruim: 400", async () => {
  assert.equal((await PATCH(pedir("PATCH", "/api/anuncios/gasto/abc", BOM), comId("abc"))).status, 404);
  assert.equal((await DELETE(pedir("DELETE", "/api/anuncios/gasto/abc"), comId("abc"))).status, 404);
  assert.equal((await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, { ...BOM, amount: 0 }), comId(L1))).status, 400);
  assert.equal(noGasto().length, 0);
});

test("DELETE: exclui o lançamento desta loja", async () => {
  alteradas = [{ id: L1 }];
  const r = await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L1}`), comId(L1));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(filtros(escrita("DELETE")[0].url), { tenant_id: "eq.loja-b", id: `eq.${L1}` });
});

test("operador e vendedora: 403 em GET, POST, PATCH e DELETE, e nada chega em ad_spend nem no relatório", async () => {
  for (const p of ["operator", "seller"]) {
    papel = p;
    chamadas.length = 0;
    const respostas = [
      await GET(pedir("GET")),
      await POST(pedir("POST", undefined, BOM)),
      await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, BOM), comId(L1)),
      await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L1}`), comId(L1)),
      // id inválido também: a permissão vem antes do 404.
      await DELETE(pedir("DELETE", "/api/anuncios/gasto/abc"), comId("abc")),
    ];
    for (const r of respostas) {
      assert.equal(r.status, 403, p);
      // A vendedora para no guard de módulo (texto fixo); o operador, na permissão do papel.
      if (p === "seller") assert.equal(await r.text(), MENSAGEM_BLOQUEIO);
      else assert.equal(await r.text(), "Sem permissão para esta ação.");
    }
    assert.equal(noGasto().length, 0, p);
  }
});

test("banco fora: 500 com mensagem nossa, nunca a do banco", async () => {
  falhar = true;
  const respostas = [
    await GET(pedir("GET")),
    await POST(pedir("POST", undefined, BOM)),
    await PATCH(pedir("PATCH", `/api/anuncios/gasto/${L1}`, BOM), comId(L1)),
    await DELETE(pedir("DELETE", `/api/anuncios/gasto/${L1}`), comId(L1)),
  ];
  for (const r of respostas) {
    assert.equal(r.status, 500);
    assert.doesNotMatch(await r.text(), /segredo/);
  }
});
