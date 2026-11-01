import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";


/**
 * Ids de rastreio em POST/PATCH /api/pages contra um Supabase de mentira
 * (molde: api/anuncios/gasto/route.test.ts). O ponto: GTM-… no campo do GA4
 * nunca chega ao banco — e o lojista recebe o erro no campo, não um rastreio
 * que some calado na página pública.
 */

let POST: (req: Request) => Promise<Response>;
let PATCH: (req: Request, props: { params: Promise<{ id: string }> }) => Promise<Response>;
/** O pedaço do `workAsyncStorage` do Next que o teste usa (molde: api/link-da-bio/route.test.ts). */
type ContextoDoNext = { run<T>(store: never, fn: () => T): T };
let contextoDoNext: ContextoDoNext;

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";

const CONTENT = {
  store_name: "Mega Stock",
  photo_url: "https://cdn.exemplo.com/foto.jpg",
  headline: "Bazar de inverno",
  description: "Peças a partir de R$ 12",
  group_topic: "atacado infantil",
  primary_color: "cobalt",
};

const PAGINA = {
  id: PAGE_ID,
  tenant_id: "loja-b",
  template_id: TEMPLATE_ID,
  slug: "bazar-de-inverno",
  status: "draft",
  content: CONTENT,
  content_schema_version: 1,
  campaign_slug: null,
  target_group_url: null,
  meta_pixel_id: null,
  ga4_id: null,
  published_version: 1,
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
};

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpoPedido: unknown = bruto ? JSON.parse(bruto) : undefined;
    chamadas.push({ metodo: req.method ?? "", url, corpo: corpoPedido });
    const umSo = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const linha = (l: object) => (umSo ? l : [l]);
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: "owner", modules: [] }]];
    else if (chave === "GET /rest/v1/landing_page_templates") [status, corpo] = [200, linha({ id: TEMPLATE_ID })];
    else if (chave === "GET /rest/v1/landing_pages") [status, corpo] = [200, linha(PAGINA)];
    else if (chave === "POST /rest/v1/landing_pages") [status, corpo] = [201, linha({ ...PAGINA, ...(corpoPedido as object) })];
    else if (chave === "PATCH /rest/v1/landing_pages") [status, corpo] = [200, linha({ ...PAGINA, ...(corpoPedido as object) })];
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
  // O PATCH chama `revalidateTag`, que lança fora de uma request do Next. A AsyncLocalStorage
  // tem de estar no globalThis antes do primeiro import do Next: por isso os imports são dinâmicos.
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
  contextoDoNext = (await import("next/dist/server/app-render/work-async-storage.external")).workAsyncStorage;
  ({ POST } = await import("./route"));
  ({ PATCH } = await import("./[id]/route"));
});

function comCacheDoNext(fn: () => Promise<Response>): Promise<Response> {
  return contextoDoNext.run({ incrementalCache: {} } as never, fn);
}
after(() => { supabase.close(); });
beforeEach(() => { chamadas.length = 0; });

function pedir(metodo: string, caminho: string, corpo: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}
const comId = { params: Promise.resolve({ id: PAGE_ID }) };
const escritas = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/landing_pages" && c.metodo !== "GET");

test("POST recusa GTM no campo do GA4 com 400 e detalhe no campo, sem gravar nada", async () => {
  const r = await POST(pedir("POST", "/api/pages", { template_id: TEMPLATE_ID, content: CONTENT, ga4_id: "GTM-WJTQSV4" }));
  assert.equal(r.status, 400);
  const corpo = (await r.json()) as { error: string; details: string[] };
  assert.equal(corpo.details.length, 1);
  assert.match(corpo.details[0], /^ga4_id /);
  assert.match(corpo.error, /G-/);
  assert.equal(escritas().length, 0);
});

test("POST recusa Pixel que não é só número", async () => {
  const r = await POST(pedir("POST", "/api/pages", { template_id: TEMPLATE_ID, content: CONTENT, meta_pixel_id: "fbq-123" }));
  assert.equal(r.status, 400);
  const corpo = (await r.json()) as { details: string[] };
  assert.match(corpo.details[0], /^meta_pixel_id /);
  assert.equal(escritas().length, 0);
});

test("POST grava os ids normalizados; vazio vira null", async () => {
  const r = await POST(pedir("POST", "/api/pages", {
    template_id: TEMPLATE_ID,
    content: CONTENT,
    meta_pixel_id: " 231123 ",
    ga4_id: " g-ab12cd34ef ",
  }));
  assert.equal(r.status, 201, await r.clone().text());
  const insert = escritas()[0]?.corpo as { meta_pixel_id: string; ga4_id: string };
  assert.equal(insert.meta_pixel_id, "231123");
  assert.equal(insert.ga4_id, "G-AB12CD34EF");

  chamadas.length = 0;
  const vazio = await POST(pedir("POST", "/api/pages", { template_id: TEMPLATE_ID, content: CONTENT, meta_pixel_id: "", ga4_id: "" }));
  assert.equal(vazio.status, 201);
  const insertVazio = escritas()[0]?.corpo as { meta_pixel_id: unknown; ga4_id: unknown };
  assert.equal(insertVazio.meta_pixel_id, null);
  assert.equal(insertVazio.ga4_id, null);
});

test("PATCH recusa id inválido antes de ler ou gravar a página", async () => {
  const r = await PATCH(pedir("PATCH", `/api/pages/${PAGE_ID}`, { ga4_id: "AW-123456", meta_pixel_id: "1234" }), comId);
  assert.equal(r.status, 400);
  const corpo = (await r.json()) as { details: string[] };
  assert.deepEqual(corpo.details.map((d) => d.split(" ")[0]), ["meta_pixel_id", "ga4_id"]);
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/landing_pages").length, 0);
});

test("PATCH grava o GA4 normalizado e apaga o Pixel com vazio", async () => {
  const r = await comCacheDoNext(() =>
    PATCH(pedir("PATCH", `/api/pages/${PAGE_ID}`, { ga4_id: "g-ab12cd34ef", meta_pixel_id: "  " }), comId),
  );
  assert.equal(r.status, 200, await r.clone().text());
  const update = escritas()[0]?.corpo as { meta_pixel_id: unknown; ga4_id: unknown };
  assert.equal(update.ga4_id, "G-AB12CD34EF");
  assert.equal(update.meta_pixel_id, null);
  const filtro = escritas()[0]?.url.searchParams.get("tenant_id");
  assert.equal(filtro, "eq.loja-b");
});
