import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { GET } from "./route";

/**
 * O cron de avisos do sino contra um Supabase de mentira (o PostgREST falso de
 * `api/orders/route.test.ts`). Este responde só as colunas pedidas no `select`,
 * como o PostgREST de verdade: o aviso falso de "sem convite" nascia justamente
 * de uma coluna que a leitura não pedia.
 */

const CRON_SECRET = "segredo-do-cron-falso-com-24-caracteres";
const LOJA = "loja-a";
const DIA = 24 * 60 * 60 * 1000;

type Linha = Record<string, unknown>;
type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
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
  process.env.CRON_SECRET = CRON_SECRET;
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

/** Só as colunas do `select`, como o PostgREST devolve. */
function projetar(linhas: Linha[], url: URL): Linha[] {
  const colunas = (url.searchParams.get("select") ?? "*").split(",");
  if (colunas.includes("*")) return linhas;
  return linhas.map((l) => Object.fromEntries(colunas.filter((c) => c in l).map((c) => [c, l[c]])));
}

type Mundo = {
  grupos: Linha[];
  campanhas: Linha[];
  /** Campanhas com clique nos últimos 3 dias; `"erro"` responde 500. */
  comClique?: string[] | "erro";
};

function mundo(m: Mundo): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    const rota = `${metodo} ${url.pathname}`;
    if (rota === "GET /rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: LOJA }] };
    if (rota === "GET /rest/v1/groups") return { status: 200, corpo: projetar(m.grupos, url) };
    if (rota === "GET /rest/v1/campaign_groups") return { status: 200, corpo: projetar(m.campanhas, url) };
    if (rota === "GET /rest/v1/link_click_events") {
      if (m.comClique === "erro") return { status: 500, corpo: { message: "timeout" } };
      const campanha = url.searchParams.get("campaign_group_id")?.replace(/^eq\./, "");
      return { status: 200, corpo: (m.comClique ?? []).includes(campanha ?? "") ? [{ id: "clique-1" }] : [] };
    }
    if (rota === "GET /rest/v1/notifications") return { status: 200, corpo: [] };
    if (rota === "POST /rest/v1/notifications") return { status: 201 };
    return { status: 500, corpo: { message: `inesperado: ${rota}` } };
  };
}

async function rodar(m: Mundo): Promise<string[]> {
  responder = mundo(m);
  const resposta = await GET(new Request("http://girumo.test/api/notifications/alerts", { headers: { authorization: `Bearer ${CRON_SECRET}` } }));
  assert.equal(resposta.status, 200);
  return chamadas
    .filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications")
    .map((c) => (c.corpo as { title: string }).title);
}

const antigo = new Date(Date.now() - 10 * DIA).toISOString();
const grupo = (id: string, invite_url: string | null): Linha => ({ id, name: id, members: 10, capacity: 1024, invite_url });
const campanha = (id: string): Linha => ({ id, name: id, updated_at: antigo });

test("grupo com convite não gera aviso de 'sem convite'", async () => {
  const titulos = await rodar({ grupos: [grupo("g1", "https://chat.whatsapp.com/abc")], campanhas: [campanha("c1")], comClique: ["c1"] });
  assert.deepEqual(titulos, []);
});

test("grupo sem convite gera o aviso com a contagem certa", async () => {
  const titulos = await rodar({
    grupos: [grupo("g1", "https://chat.whatsapp.com/abc"), grupo("g2", null)],
    campanhas: [campanha("c1")],
    comClique: ["c1"],
  });
  assert.deepEqual(titulos, ["1 grupo sem convite configurado"]);
});

test("campanha com clique nos últimos 3 dias não é avisada como parada", async () => {
  const titulos = await rodar({
    grupos: [grupo("g1", "https://chat.whatsapp.com/abc")],
    campanhas: [campanha("ativa"), campanha("parada")],
    comClique: ["ativa"],
  });
  assert.deepEqual(titulos, ['Campanha "parada" parada há 3+ dias']);
});

test("erro lendo os cliques não avisa campanha parada", async () => {
  const titulos = await rodar({ grupos: [grupo("g1", "https://chat.whatsapp.com/abc")], campanhas: [campanha("c1")], comClique: "erro" });
  assert.deepEqual(titulos, []);
});
