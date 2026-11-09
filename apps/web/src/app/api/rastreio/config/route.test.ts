import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { NUMERO_DA_LOJA_CONECTADO } from "@/lib/rastreio/config-painel";
import { RASTREIO_DISABLED } from "@/lib/rastreio/rota-painel";
import { MATRIZ_PADRAO } from "@/lib/rastreio/tipos";
import { servirRastreio, type Chamada, type Resposta } from "@/test/rastreio-painel-falso";

import { GET, PATCH } from "./route";

/** Config do Rastreio com o dono logado por Bearer contra um PostgREST de mentira. */

const LINK_VIP = "0b6f1c2a-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const CONFIG = {
  tenant_id: "loja-b", public_slug: "loja-exemplo", matrix: MATRIZ_PADRAO, notify_store_on_problem: false,
  vip_link_id: null, store_whatsapp: null, imported_at: null, sweep_cursor: "segredo-do-cursor",
};
const LINK = { id: LINK_VIP, tenant_id: "loja-b", campaign_group_id: "camp-1", slug: "vip-exemplo", target_url: "https://x.test", clicks: 0, metadata: {}, created_at: "", updated_at: "" };
const SEM_CAMPANHA = { ...LINK, id: "1c7a2d3b-4e5f-4a6b-9c7d-8e9f0a1b2c3d", campaign_group_id: null, slug: "avulso" };

const chamadas: Chamada[] = [];
let papel = "owner";
let tabelas: Record<string, Resposta> = {};

const { doBanco, escritas } = servirRastreio({ chamadas, papel: () => papel, tabelas: () => tabelas });

beforeEach(() => {
  chamadas.length = 0;
  papel = "owner";
  tabelas = {
    "GET /rest/v1/tenant_settings": [{ rastreio_enabled: true }],
    "GET /rest/v1/tracking_settings": [CONFIG],
    "PATCH /rest/v1/tracking_settings": [CONFIG],
    "GET /rest/v1/custom_domains": [],
    "GET /rest/v1/organizations": [{ name: "Loja Exemplo", niche: null }],
    "GET /rest/v1/bio_pages": [],
    "GET /rest/v1/yampi_connections": [],
    "GET /rest/v1/tracked_links": [LINK, SEM_CAMPANHA],
    "GET /rest/v1/instances": [],
  };
});

const HEADERS = { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" };
const ler = () => GET(new Request("http://girumo.test/api/rastreio/config", { headers: HEADERS }));
const salvar = (corpo: unknown) =>
  PATCH(new Request("http://girumo.test/api/rastreio/config", { method: "PATCH", headers: HEADERS, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }));

test("GET: config sem tenant nem cursor, link da busca, links de convite só da loja, yampi null", async () => {
  const r = await ler();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const texto = await r.text();
  assert.ok(!texto.includes("segredo-do-cursor"));
  const corpo = JSON.parse(texto);
  assert.equal(corpo.config.publicSlug, "loja-exemplo");
  assert.equal(corpo.config.tenantId, undefined);
  assert.equal(corpo.linkDaBusca, "https://www.girumo.com.br/rastreio/loja-exemplo");
  assert.equal(corpo.loja, "Loja Exemplo");
  assert.equal(corpo.yampi, null);
  assert.deepEqual(corpo.linksDeConvite, [{ id: LINK_VIP, slug: "vip-exemplo" }]);
  const links = doBanco().find((c) => c.url.pathname === "/rest/v1/tracked_links");
  assert.equal(links?.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("GET: yampi ativa aparece como status", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/yampi_connections": [{ tenant_id: "loja-b", status: "ativa", alias: "loja-exemplo" }] };
  const corpo = await (await ler()).json();
  assert.equal(corpo.yampi, "ativa");
});

test("PATCH em loja sem config cria antes de escrever", async () => {
  let lidas = 0;
  tabelas = {
    ...tabelas,
    "GET /rest/v1/tracking_settings": () => ({ status: 200, corpo: lidas++ === 0 ? [] : [CONFIG] }),
    "POST /rest/v1/tracking_settings": () => ({ status: 201, corpo: [CONFIG] }),
  };
  const r = await salvar({ notifyStoreOnProblem: true });
  assert.equal(r.status, 200);
  assert.deepEqual(escritas().map((c) => c.metodo), ["POST", "PATCH"]);
  assert.equal((escritas()[1].corpo as { notify_store_on_problem: boolean }).notify_store_on_problem, true);
});

test("PATCH com matriz parcial: 400 matrix, sem escrita", async () => {
  const r = await salvar({ matrix: { enviado: { whatsapp: true, email: true } } });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Escolha os avisos de todas as etapas.", campo: "matrix" });
  assert.deepEqual(escritas(), []);
});

test("PATCH com slug reservado: 400", async () => {
  const r = await salvar({ publicSlug: "loja-girumo" });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Esse endereço é reservado. Escolha outro.", campo: "publicSlug" });
  assert.deepEqual(escritas(), []);
});

test("PATCH com corpo que não é JSON: 400 corpo", async () => {
  const r = await salvar("{não é json");
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Corpo inválido.", campo: "corpo" });
});

test("PATCH com link de outra loja ou sem campanha: 400", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/tracked_links": [] };
  const r = await salvar({ vipLinkId: LINK_VIP });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Esse link não é da sua loja.", campo: "vipLinkId" });
  assert.equal(doBanco().find((c) => c.url.pathname === "/rest/v1/tracked_links")?.url.searchParams.get("tenant_id"), "eq.loja-b");

  tabelas = { ...tabelas, "GET /rest/v1/tracked_links": [SEM_CAMPANHA] };
  assert.equal((await salvar({ vipLinkId: SEM_CAMPANHA.id })).status, 400);
  assert.deepEqual(escritas(), []);
});

test("PATCH com o número de uma instância da loja: 400", async () => {
  tabelas = { ...tabelas, "GET /rest/v1/instances": [{ id: "i1", tenant_id: "loja-b", phone: "5511912345678", status: "connected", purpose: "grupos" }] };
  const r = await salvar({ storeWhatsapp: "(11) 91234-5678" });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: NUMERO_DA_LOJA_CONECTADO, campo: "storeWhatsapp" });
  assert.deepEqual(escritas(), []);
});

test("PATCH com storeWhatsapp vazio grava null", async () => {
  const r = await salvar({ storeWhatsapp: "" });
  assert.equal(r.status, 200);
  assert.ok(JSON.stringify(escritas()[0].corpo).includes('"store_whatsapp":null'));
});

test("PATCH com vipLinkId válido grava e responde como o GET", async () => {
  const r = await salvar({ vipLinkId: LINK_VIP });
  assert.equal(r.status, 200);
  assert.equal((escritas()[0].corpo as { vip_link_id: string }).vip_link_id, LINK_VIP);
  assert.equal((await r.json()).linkDaBusca, "https://www.girumo.com.br/rastreio/loja-exemplo");
});

test("slug que o banco recusa por unique: 409", async () => {
  tabelas = {
    ...tabelas,
    "PATCH /rest/v1/tracking_settings": () => ({
      status: 409,
      corpo: { code: "23505", message: 'duplicate key value violates unique constraint "tracking_settings_public_slug_key"' },
    }),
  };
  const r = await salvar({ publicSlug: "loja-outra" });
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "Esse endereço já está em uso. Escolha outro.", campo: "publicSlug" });
});

test("vendedora: 403 do mapa; operador: 403; módulo desligado: 403", async () => {
  papel = "seller";
  const v = await ler();
  assert.equal(v.status, 403);
  assert.equal(await v.text(), MENSAGEM_BLOQUEIO);
  papel = "operator";
  assert.equal((await ler()).status, 403);
  papel = "owner";
  tabelas = { ...tabelas, "GET /rest/v1/tenant_settings": [{ rastreio_enabled: false }] };
  const d = await salvar({ notifyStoreOnProblem: true });
  assert.equal(d.status, 403);
  assert.deepEqual(await d.json(), RASTREIO_DISABLED);
});
