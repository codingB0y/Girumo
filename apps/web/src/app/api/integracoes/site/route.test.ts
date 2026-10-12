// apps/web/src/app/api/integracoes/site/route.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { GET } from "./route";

/** Dono logado por Bearer contra um Supabase de mentira (molde de site/chave/route.test.ts). */

const LINK = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const OUTRO_LINK = "7d6c5b4a-3e2f-4a1b-8c9d-0e1f2a3b4c5d";
type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];
let papel = "owner";
let integrada = true;
let leadsQuebrado = false;

/** 14:52, 14:47, 14:31, 14:12 e 13:58 em Brasília. */
const CADASTROS = [
  { id: "c5", whatsapp: "+5562999994821", phone_key: "6299994821", utm_campaign: "Verão", utm_content: "Verão Kids — vídeo 15s", created_at: "2026-10-10T17:52:00+00:00" },
  { id: "c4", whatsapp: "+5564999993390", phone_key: "6499993390", utm_campaign: "Provador", utm_content: "Provador ao vivo — reels", created_at: "2026-10-10T17:47:00+00:00" },
  { id: "c3", whatsapp: "+5562999991107", phone_key: "6299991107", utm_campaign: "Kit", utm_content: "Kit 10 peças — carrossel", created_at: "2026-10-10T17:31:00+00:00" },
  { id: "c2", whatsapp: "+5561999990458", phone_key: "6199990458", utm_campaign: null, utm_content: null, created_at: "2026-10-10T17:12:00+00:00" },
  { id: "c1", whatsapp: "+5562999997712", phone_key: "6299997712", utm_campaign: "Verão", utm_content: "Verão Kids — vídeo 15s", created_at: "2026-10-10T16:58:00+00:00" },
];
const LEADS = [
  { id: "l5", phone: "556299994821", entered_at: "2026-10-10T17:53:00+00:00" }, // sem o 9: casa pela chave
  { id: "l3", phone: "5562999991107", entered_at: "2026-09-01T12:00:00+00:00" },
  { id: "l1", phone: "5562999997712", entered_at: "2026-10-10T17:00:00+00:00" },
];
const PEDIDO_PELO_LEAD = { id: "o1", phone: "", lead_id: "l1", value: 720, created_at: "2026-10-10T18:30:00+00:00" };

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  chamadas.push({ metodo: req.method ?? "", url });
  const chave = `${req.method} ${url.pathname}`;
  let status = 200;
  let corpo: unknown = [];
  if (url.pathname === "/auth/v1/user") corpo = { id: "usuario-1", email: "dono@loja.test" };
  else if (url.pathname === "/rest/v1/memberships") corpo = [{ tenant_id: "loja-b", role: papel }];
  else if (chave === "GET /rest/v1/site_integrations")
    corpo = integrada
      ? [{ tenant_id: "loja-b", key_last4: "7f2a", tracked_link_id: LINK, created_at: "2026-10-01T12:00:00+00:00", rotated_at: "2026-10-10T12:00:00+00:00", last_used_at: "2026-10-10T17:52:01+00:00" }]
      : [];
  else if (chave === "GET /rest/v1/tracked_links") corpo = [{ id: LINK, slug: "vip-atacado" }, { id: OUTRO_LINK, slug: "moda-sul" }];
  else if (chave === "HEAD /rest/v1/site_captures") res.setHeader("Content-Range", integrada ? "*/612" : "*/0");
  else if (chave === "GET /rest/v1/site_captures") corpo = integrada ? CADASTROS : [];
  else if (chave === "GET /rest/v1/leads") [status, corpo] = leadsQuebrado ? [500, { message: "permission denied for table leads" }] : [200, LEADS];
  else if (chave === "GET /rest/v1/orders") corpo = url.searchParams.has("lead_id") ? [PEDIDO_PELO_LEAD] : [];
  else if (chave === "GET /rest/v1/link_click_events") corpo = [{ capture_id: "c4" }];
  else [status, corpo] = [500, { message: `inesperado: ${chave}` }];
  res.statusCode = status;
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
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

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/site", {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

function reiniciar(over: { papel?: string; integrada?: boolean; leadsQuebrado?: boolean } = {}): void {
  chamadas.length = 0;
  papel = over.papel ?? "owner";
  integrada = over.integrada ?? true;
  leadsQuebrado = over.leadsQuebrado ?? false;
}

const doBanco = (c: Chamada) => c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/memberships";

test("dono vê chave mascarada, link, contagem e os 5 últimos com a situação", async () => {
  reiniciar();
  const resposta = await GET(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();

  assert.equal(corpo.ativa, true);
  assert.equal(corpo.key_last4, "7f2a");
  assert.equal(corpo.gerada_em, "2026-10-10T12:00:00+00:00");
  assert.deepEqual(corpo.link, { id: LINK, slug: "vip-atacado" });
  assert.equal(corpo.last_used_at, "2026-10-10T17:52:01+00:00");
  assert.equal(corpo.recebidos_30d, 612);
  assert.deepEqual(corpo.links, [{ id: LINK, slug: "vip-atacado" }, { id: OUTRO_LINK, slug: "moda-sul" }]);

  assert.deepEqual(
    corpo.ultimos.map((u: { situacao: string }) => u.situacao.replace(/\s/g, " ")),
    [
      "Entrou no grupo às 14:53",
      "Foi pro grupo, ainda não entrou",
      "Já era do grupo",
      "Ainda não abriu o link do grupo",
      "Comprou · R$ 720,00",
    ],
  );
  assert.deepEqual(corpo.ultimos[0], {
    hora: "2026-10-10T17:52:00+00:00",
    telefone_mascarado: "(62) 9••••-4821",
    anuncio: "Verão Kids — vídeo 15s",
    situacao: "Entrou no grupo às 14:53",
  });
  assert.equal(corpo.ultimos[3].anuncio, "(sem UTM)");

  // A contagem é HEAD (count), nunca as linhas: o PostgREST corta em 1000 sem erro.
  const contagem = chamadas.find((c) => c.metodo === "HEAD" && c.url.pathname === "/rest/v1/site_captures");
  assert.match(contagem?.url.searchParams.get("created_at") ?? "", /^gte\./);
  const ultimos = chamadas.find((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/site_captures" && c.url.searchParams.has("limit"));
  assert.equal(ultimos?.url.searchParams.get("limit"), "5");
  assert.equal(ultimos?.url.searchParams.get("order"), "created_at.desc");
});

test("o número inteiro nunca sai na resposta", async () => {
  reiniciar();
  const texto = await (await GET(pedir())).text();
  for (const c of CADASTROS) assert.ok(!texto.includes(c.whatsapp.slice(5)), c.whatsapp);
  assert.ok(!texto.includes("whatsapp"));
  assert.ok(!texto.includes("phone"));
});

test("toda consulta ao banco filtra pela loja do contexto", async () => {
  reiniciar();
  await GET(pedir());
  const consultas = chamadas.filter(doBanco);
  assert.ok(consultas.length >= 8, `consultas: ${consultas.length}`);
  for (const c of consultas) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", `${c.metodo} ${c.url.pathname}`);
});

test("operador e vendedora: 403 sem tocar em dado da loja", async () => {
  for (const p of ["operator", "seller"]) {
    reiniciar({ papel: p });
    assert.equal((await GET(pedir())).status, 403);
    assert.equal(chamadas.filter(doBanco).length, 0, p);
  }
});

test("loja sem integração: ativa falsa, sem chave nem link, e nada além dos cadastros é lido", async () => {
  reiniciar({ integrada: false });
  const corpo = await (await GET(pedir())).json();
  assert.equal(corpo.ativa, false);
  assert.equal(corpo.key_last4, null);
  assert.equal(corpo.gerada_em, null);
  assert.equal(corpo.link, null);
  assert.equal(corpo.recebidos_30d, 0);
  assert.deepEqual(corpo.ultimos, []);
  assert.equal(corpo.links.length, 2);
  const lidas = new Set(chamadas.filter(doBanco).map((c) => c.url.pathname));
  assert.ok(!lidas.has("/rest/v1/leads") && !lidas.has("/rest/v1/orders") && !lidas.has("/rest/v1/link_click_events"));
});

test("banco falhando: 500 sem a mensagem do banco", async () => {
  reiniciar({ leadsQuebrado: true });
  const resposta = await GET(pedir());
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("permission denied"));
});
