import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { GET } from "./route";

/**
 * A carga da Início contra um Supabase de mentira (o mesmo de
 * `app/api/orders/route.test.ts`): sessão e membership saem como em produção,
 * só a rede é trocada. A Início recarrega a cada minuto, então o que importa
 * aqui é o que ela PEDE ao banco, não só o que devolve.
 *
 * Tabela que o teste não descreve responde 500 e vira `ok:false` naquela parte
 * — a rota foi feita para isso, e as partes testadas não dependem delas.
 */

type Chamada = { metodo: string; url: URL; prefer: string };
type Resposta = { status: number; corpo?: unknown; contentRange?: string };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      prefer: String(req.headers.prefer ?? ""),
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
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});

after(() => {
  supabase.close();
});

function banco(tabelas: Record<string, (chamada: Chamada) => Resposta>): (chamada: Chamada) => Resposta {
  return (chamada) => {
    const { metodo, url } = chamada;
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela(chamada) : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

function inicioDoDono(): Request {
  return new Request("http://girumo.test/api/painel/inicio", {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

function feitas(caminho: string): Chamada[] {
  return chamadas.filter((c) => c.url.pathname === caminho);
}

test("a Início conta os contatos no banco em vez de baixar a lista a cada minuto", async () => {
  chamadas.length = 0;
  responder = banco({
    "HEAD /rest/v1/leads": ({ url }) => ({
      status: 200,
      contentRange: url.searchParams.get("status") === "eq.comprou" ? "*/42" : "*/2923",
    }),
    // O mutante (a lista de volta) recebe o teto de verdade do PostgREST.
    "GET /rest/v1/leads": () => ({ status: 200, corpo: [], contentRange: "0-999/*" }),
  });

  const res = await GET(inicioDoDono());
  assert.equal(res.status, 200);
  const corpo = (await res.json()) as Record<string, unknown>;

  // Acima das 1000 linhas que a lista devolvia: a meta de contatos do mês volta a poder bater.
  assert.deepEqual(corpo.leadCount, { ok: true, data: { total: 2923, clientes: 42 } });
  assert.equal(corpo.leads, undefined);

  const leads = feitas("/rest/v1/leads");
  assert.ok(leads.length > 0);
  for (const pedido of leads) {
    assert.equal(pedido.metodo, "HEAD", "a Início não baixa linha de contato");
    assert.match(pedido.prefer, /count=exact/);
    // Service-role passa por cima do RLS: sem o filtro, a conta é a de todas as lojas.
    assert.equal(pedido.url.searchParams.get("tenant_id"), "eq.loja-b");
  }
});

test("os pedidos da Início vêm só do mês corrente e só com valor e data", async () => {
  chamadas.length = 0;
  const pedido = { id: "p1", value: 149.9, created_at: new Date().toISOString() };
  responder = banco({ "GET /rest/v1/orders": () => ({ status: 200, corpo: [pedido] }) });

  const res = await GET(inicioDoDono());
  const corpo = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(corpo.orders, { ok: true, data: [pedido] });

  const [lida, ...outras] = feitas("/rest/v1/orders");
  assert.equal(outras.length, 0);
  assert.equal(lida.metodo, "GET");
  assert.equal(lida.url.searchParams.get("tenant_id"), "eq.loja-b");

  const colunas = (lida.url.searchParams.get("select") ?? "").split(",").sort();
  assert.deepEqual(colunas, ["created_at", "id", "value"]);

  // Desde o começo do mês de Brasília (com folga de fuso), nunca o histórico inteiro.
  const desde = Date.parse((lida.url.searchParams.get("created_at") ?? "").replace(/^gte\./, ""));
  assert.ok(Number.isFinite(desde), "sem recorte de data");
  const agora = Date.now();
  assert.ok(desde <= agora, "o recorte não pode cortar o pedido de agora");
  assert.ok(agora - desde <= 33 * 86_400_000, "o recorte passa de um mês");
});
