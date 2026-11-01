import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { RASTREIO_DISABLED } from "@/lib/rastreio/rota-painel";
import { servirRastreio, type Chamada, type Resposta } from "@/test/rastreio-painel-falso";

import { GET, POST } from "./route";

/** A lista de Entregas com o dono logado por Bearer contra um PostgREST de mentira (`src/test/rastreio-painel-falso.ts`). */

const PEDIDO_PROBLEMA = {
  id: "0b6f1c2a-3d4e-4f5a-8b6c-7d8e9f0a1b2c", numero: "1050", buyer_first_name: "Ana", buyer_phone: "5511987654321",
  etapa: "problema", etapa_at: "2026-10-30T12:00:00+00:00", tracking_code: "AB123456789BR", status_raw: "on_carriage",
  link_token: "tok-problema",
};
const PEDIDO_ENVIADO = {
  ...PEDIDO_PROBLEMA, id: "1c7a2d3b-4e5f-4a6b-9c7d-8e9f0a1b2c3d", numero: "1049", etapa: "enviado", link_token: "tok-enviado",
};

const chamadas: Chamada[] = [];
let papel = "owner";
let tabelas: Record<string, Resposta> = {};

const { doBanco } = servirRastreio({ chamadas, papel: () => papel, tabelas: () => tabelas });

/** Os chips: 3 problemas, o resto zero. */
const contagem = (c: Chamada) => ({
  status: 200,
  contentRange: `*/${c.url.searchParams.get("etapa") === "eq.problema" ? 3 : 0}`,
});

beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  delete process.env.RASTREIO_DOC_PEPPER;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  tabelas = {
    "GET /rest/v1/tenant_settings": [{ rastreio_enabled: true }],
    "GET /rest/v1/tracking_settings": [],
    "GET /rest/v1/tracking_orders": [PEDIDO_PROBLEMA, PEDIDO_ENVIADO],
    "HEAD /rest/v1/tracking_orders": contagem,
    "GET /rest/v1/tracking_notices": [],
    "HEAD /rest/v1/tracking_notices": () => ({ status: 200, contentRange: "*/0" }),
  };
});

const HEADERS = { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" };

function postar(corpo: unknown): Request {
  return new Request("http://girumo.test/api/rastreio/entregas", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const ler = (query: string) => new Request(`http://girumo.test/api/rastreio/entregas?${query}`, { headers: HEADERS });
const aoRastreio = () => doBanco().filter((c) => c.url.pathname.startsWith("/rest/v1/tracking_"));

test("dono lista as entregas da própria loja", async () => {
  const r = await POST(postar({ filtro: "problema", pagina: 1 }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const corpo = await r.json();
  assert.equal(corpo.linhas[0].numero, "1050");
  assert.equal(corpo.numeros.problema, 3);
  assert.equal(corpo.filtro, "problema");
  assert.equal(corpo.linhas[0].link, null);
  const pedidos = aoRastreio();
  assert.ok(pedidos.length > 0);
  for (const c of pedidos) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", c.url.toString());
});

test("link do pedido na linha", async () => {
  tabelas = {
    ...tabelas,
    "GET /rest/v1/tracking_settings": [{
      tenant_id: "loja-b", public_slug: "loja-exemplo", matrix: {}, notify_store_on_problem: false, vip_link_id: null,
      store_whatsapp: null, imported_at: null, sweep_cursor: null,
    }],
    "GET /rest/v1/custom_domains": [],
    "GET /rest/v1/organizations": [{ name: "Loja Exemplo", niche: null }],
    "GET /rest/v1/bio_pages": [],
  };
  const corpo = await (await POST(postar({}))).json();
  assert.equal(corpo.linhas[0].link, "https://www.girumo.com.br/rastreio/loja-exemplo/tok-problema");
});

test("telefone só na linha de problema", async () => {
  const r = await POST(postar({}));
  const texto = await r.text();
  const corpo = JSON.parse(texto);
  const problema = corpo.linhas.find((l: { etapa: string }) => l.etapa === "problema");
  const enviado = corpo.linhas.find((l: { etapa: string }) => l.etapa === "enviado");
  assert.equal(problema.telefone, "5511987654321");
  assert.equal(enviado.telefone, null);
  assert.ok(!texto.includes("buyer_email_enc"));
  assert.ok(!texto.includes("doc_hmac"));
});

test("GET ignora a busca", async () => {
  process.env.RASTREIO_DOC_PEPPER = "pepper-de-teste-com-tamanho-suficiente-1234";
  const r = await GET(ler("filtro=sem_codigo&busca=11144477735"));
  assert.equal(r.status, 200);
  const lista = aoRastreio().find((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/tracking_orders");
  assert.ok(lista);
  assert.ok(!lista.url.toString().includes("doc_hmac"));
  assert.equal(lista.url.searchParams.get("etapa"), "eq.separando");
});

test("erro de busca não vaza o documento no log", async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
  try {
    const r = await POST(postar({ busca: "11144477735" }));
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "Não deu para buscar as entregas." });
  } finally {
    console.error = original;
  }
  assert.ok(logs.length > 0);
  assert.ok(logs.every((l) => !l.includes("11144477735")), logs.join("\n"));
});

test("vendedora recebe o 403 do mapa", async () => {
  papel = "seller";
  const r = await POST(postar({}));
  assert.equal(r.status, 403);
  assert.equal(await r.text(), MENSAGEM_BLOQUEIO);
  assert.equal(doBanco().filter((c) => c.url.pathname === "/rest/v1/tenant_settings").length, 0);
  assert.equal(aoRastreio().length, 0);
});

test("operador não tem settings:connection", async () => {
  papel = "operator";
  const r = await POST(postar({}));
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "Sem permissão para esta ação." });
  assert.equal(aoRastreio().length, 0);
});

test("módulo desligado: 403 e nenhuma leitura de pedido", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/tenant_settings": [{ rastreio_enabled: false }] };
  const r = await POST(postar({}));
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), RASTREIO_DISABLED);
  assert.equal(aoRastreio().length, 0);
});

test("pedido que não é uuid", async () => {
  const r = await POST(postar({ pedido: "1050" }));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Pedido inválido." });
  assert.equal(aoRastreio().length, 0);
  assert.equal((await GET(ler("pedido=abc"))).status, 400);
});
