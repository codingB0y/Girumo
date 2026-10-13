import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { GET } from "./route";

/** Dono logado por Bearer (mesmo molde de api/resultados/anuncios/route.test.ts). */

const PESSOAS = {
  por_origem: [{ origem: "ig", cadastros: 3, vendido: 2440 }],
  compradores: [
    {
      lead_id: "lead-1",
      nome: "Bia Kids Modas",
      telefone: "5562999994821",
      grupo: "VIP 1",
      cadastro_em: "2026-09-14T15:00:00+00:00",
      primeira_compra: "2026-09-16T15:00:00+00:00",
      pedidos: 2,
      vendido: 1480,
    },
    {
      lead_id: null,
      nome: null,
      telefone: "5562977771107",
      grupo: null,
      cadastro_em: "2026-09-15T15:00:00+00:00",
      primeira_compra: "2026-09-15T18:00:00+00:00",
      pedidos: 1,
      vendido: 960,
    },
  ],
  sem_compra: ["lead-2", "lead-3"],
};

function lead(id: string, entered_at: string, phone: string) {
  return {
    id,
    tenant_id: "loja-b",
    phone,
    name: null,
    source_group_id: "g1",
    source_group_name: "VIP 1",
    source_campaign: null,
    status: "novo",
    entered_at,
    last_seen_at: null,
    also_in: [],
    metadata: {},
    created_at: entered_at,
    updated_at: entered_at,
  };
}
const LEADS = [
  lead("lead-1", "2026-09-20T12:00:00Z", "5562999994821"),
  lead("lead-2", "2026-09-25T12:00:00Z", "5562988881107"),
  lead("lead-3", "2026-09-22T12:00:00Z", "5562977773333"),
];

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let rpc: { status: number; corpo: unknown } = { status: 200, corpo: PESSOAS };
let leadsFalham = false;

/** `id=in.(a,b)` do postgrest-js → ["a", "b"]. */
function idsDaBusca(url: URL): string[] {
  return (url.searchParams.get("id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
}

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
    else if (chave === "POST /rest/v1/rpc/attribution_people") [status, corpo] = [rpc.status, rpc.corpo];
    else if (chave === "GET /rest/v1/leads") {
      const ids = idsDaBusca(url);
      [status, corpo] = leadsFalham
        ? [500, { message: "leads caiu" }]
        : [200, LEADS.filter((l) => ids.includes(l.id))];
    }
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
  rpc = { status: 200, corpo: PESSOAS };
  leadsFalham = false;
});

const PERIODO = "de=2026-09-11&ate=2026-10-10";
function pedir(busca: string): Request {
  return new Request(`http://girumo.test/api/resultados/anuncios/pessoas?${busca}`, {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}
const doRpc = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/attribution_people");
const dosLeads = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/leads");

test("gaveta: telefone mascarado, sem id; o tenant do RPC é o da sessão e o anúncio vai como veio", async () => {
  const resposta = await GET(
    pedir(
      `${PERIODO}&campanha=VIP+Atacado+%E2%80%94+Goi%C3%A2nia&anuncio=50%25+off+%26+frete%2Bgr%C3%A1tis&tenant_id=loja-x&p_tenant=loja-x`,
    ),
  );
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const texto = await resposta.text();
  const corpo = JSON.parse(texto);
  assert.deepEqual(doRpc()[0]?.corpo, {
    p_tenant: "loja-b",
    p_de: "2026-09-11",
    p_ate: "2026-10-10",
    p_campanha: "VIP Atacado — Goiânia",
    p_conjunto: null,
    p_anuncio: "50% off & frete+grátis",
  });
  assert.deepEqual(
    corpo.compradores.map((c: { nome: string | null; telefone: string; em_contatos: boolean }) => [
      c.nome,
      c.telefone,
      c.em_contatos,
    ]),
    [
      ["Bia Kids Modas", "(62) 9••••-4821", true],
      [null, "(62) 9••••-1107", false],
    ],
  );
  assert.equal(corpo.contatos_dos_compradores, 1);
  assert.equal(corpo.sem_compra, 2);
  assert.doesNotMatch(texto, /5562999994821|5562977771107|lead-|lead_id/);
  assert.equal(dosLeads().length, 0);
});

test("operador e admin também leem a gaveta (não tem gasto nela)", async () => {
  for (const p of ["operator", "admin"]) {
    papel = p;
    assert.equal((await GET(pedir(PERIODO))).status, 200, p);
  }
});

test("vendedora: 403 do guard de módulo e o RPC nunca roda", async () => {
  papel = "seller";
  const resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 403);
  assert.equal(doRpc().length, 0);
});

test("lista=compraram: só quem tem contato, lido por id e filtrando a loja, com o número inteiro", async () => {
  const resposta = await GET(pedir(`${PERIODO}&anuncio=A1&lista=compraram`));
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.deepEqual(
    corpo.contatos.map((c: { id: string; phone: string }) => [c.id, c.phone]),
    [["lead-1", "5562999994821"]],
  );
  const [consulta] = dosLeads();
  assert.equal(consulta.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.deepEqual(idsDaBusca(consulta.url), ["lead-1"]);
});

test("lista=sem-compra: os que entraram sem comprar, mais recentes primeiro", async () => {
  const corpo = await (await GET(pedir(`${PERIODO}&anuncio=A1&lista=sem-compra`))).json();
  assert.deepEqual(corpo.contatos.map((c: { id: string }) => c.id), ["lead-2", "lead-3"]);
});

test("mais de 100 pessoas: lotes de 100 no in(), todos filtrando a loja", async () => {
  rpc = { status: 200, corpo: { ...PESSOAS, sem_compra: Array.from({ length: 150 }, (_, i) => `lead-${i}`) } };
  assert.equal((await GET(pedir(`${PERIODO}&lista=sem-compra`))).status, 200);
  const consultas = dosLeads();
  assert.deepEqual(consultas.map((c) => idsDaBusca(c.url).length).sort((a, b) => a - b), [50, 100]);
  for (const c of consultas) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("ninguém na lista: nenhuma consulta a leads", async () => {
  rpc = { status: 200, corpo: { ...PESSOAS, compradores: [], sem_compra: [] } };
  const corpo = await (await GET(pedir(`${PERIODO}&lista=compraram`))).json();
  assert.deepEqual(corpo, { contatos: [] });
  assert.equal(dosLeads().length, 0);
});

test("busca ruim: 400 com mensagem e o banco não é consultado", async () => {
  for (const busca of [
    `${PERIODO}&lista=todos`,
    `${PERIODO}&anuncio=${"x".repeat(2001)}`,
    "de=2026-10-10&ate=2026-09-01",
    "de=2026-02-30&ate=2026-03-10",
  ]) {
    chamadas.length = 0;
    const resposta = await GET(pedir(busca));
    assert.equal(resposta.status, 400, busca);
    assert.equal(typeof (await resposta.json()).error, "string", busca);
    assert.equal(doRpc().length, 0, busca);
  }
});

test("o banco recusa o período (22023): 400, não 500", async () => {
  rpc = { status: 400, corpo: { code: "22023", message: "periodo invalido", details: null, hint: null } };
  const resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), { error: "Período inválido." });
});

test("erro do banco, formato quebrado ou leads fora do ar: 500 sem vazar a mensagem", async () => {
  rpc = { status: 401, corpo: { code: "42501", message: "permission denied for function attribution_people" } };
  let resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /permission|attribution_people/);

  rpc = { status: 200, corpo: { ...PESSOAS, sem_compra: "2" } };
  resposta = await GET(pedir(PERIODO));
  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: "Não deu para carregar quem veio por este anúncio." });

  rpc = { status: 200, corpo: PESSOAS };
  leadsFalham = true;
  resposta = await GET(pedir(`${PERIODO}&lista=sem-compra`));
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /leads caiu/);
});
