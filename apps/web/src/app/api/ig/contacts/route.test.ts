import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { POST as BULK } from "./bulk-tags/route";
import { GET as EXPORTAR } from "./export/route";
import { DELETE, GET as FICHA, PATCH } from "./[id]/route";
import { GET as LISTA } from "./route";

/** Dono/admin/operador logado por Bearer contra um Supabase de mentira (molde: api/anuncios/gasto/route.test.ts). */

const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const AGORA = Date.now();
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let ligado = true;
let desligadoEm: string | null = null;
/** A loja dona da ficha no "banco": quem pergunta com outro tenant_id não a vê. */
let donoDaFicha = "loja-b";
let campos: Record<string, unknown> = { tamanho: "Infantil" };

const ficha = () => ({ id: ID, tenant_id: donoDaFicha, ig_user_id: "u1", username: "ana", fields: campos, tags: ["vip"], first_seen_at: "2026-11-01T00:00:00Z", last_seen_at: "2026-11-02T00:00:00Z", last_dm_at: null, source_flow_id: null, updated_at: "2026-11-02T00:00:00Z" });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    const visivel = url.searchParams.get("tenant_id") === `eq.${donoDaFicha}`;
    let corpo: unknown = [];
    if (url.pathname === "/auth/v1/user") corpo = { id: "usuario-1", email: "dono@loja.test" };
    else if (url.pathname === "/rest/v1/memberships") corpo = [{ tenant_id: "loja-b", role: papel, modules: [] }];
    else if (url.pathname === "/rest/v1/tenant_settings") {
      const so = url.searchParams.get("select") === "instagram_disabled_at";
      corpo = so ? { instagram_disabled_at: desligadoEm } : { tenant_id: "loja-b", instagram_enabled: ligado };
    } else if (url.pathname === "/rest/v1/ig_contacts" && req.method === "GET") {
      const lista = visivel ? [ficha()] : [];
      corpo = objeto ? (lista[0] ?? null) : lista;
    } else if (url.pathname === "/rest/v1/rpc/ig_contact_apply") corpo = ficha();
    res.setHeader("Content-Type", "application/json");
    if (req.method === "HEAD") res.setHeader("Content-Range", "*/1");
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(corpo));
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
  ligado = true;
  desligadoEm = null;
  donoDaFicha = "loja-b";
  campos = { tamanho: "Infantil" };
});

function pedir(metodo: string, caminho: string, corpo?: unknown): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}
const comId = (id: string) => ({ params: Promise.resolve({ id }) });
const escritas = () => chamadas.filter((c) => c.metodo !== "GET" && c.metodo !== "HEAD" && (c.url.pathname.startsWith("/rest/v1/ig_") || c.url.pathname.startsWith("/rest/v1/rpc/ig_")));

test("ficha de outra loja é 404, com a leitura filtrada pela loja da sessão", async () => {
  donoDaFicha = "loja-a";
  for (const r of [await FICHA(pedir("GET", `/api/ig/contacts/${ID}`), comId(ID)), await PATCH(pedir("PATCH", `/api/ig/contacts/${ID}`, { add: ["vip"] }), comId(ID)), await DELETE(pedir("DELETE", `/api/ig/contacts/${ID}`), comId(ID))]) {
    assert.equal(r.status, 404);
  }
  assert.deepEqual(escritas(), [], "nada gravado em ficha alheia");
  const leitura = chamadas.find((c) => c.url.pathname === "/rest/v1/ig_contacts");
  assert.equal(leitura?.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("id que não é uuid é 404 sem ir ao banco", async () => {
  const r = await FICHA(pedir("GET", "/api/ig/contacts/x"), comId("x"));
  assert.equal(r.status, 404);
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/ig_contacts").length, 0);
});

test("ficha da loja devolve a pessoa e os atendimentos, sem o id do Instagram", async () => {
  const r = await FICHA(pedir("GET", `/api/ig/contacts/${ID}`), comId(ID));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.pessoa.username, "ana");
  assert.deepEqual(corpo.atendimentos, []);
  assert.doesNotMatch(JSON.stringify(corpo), /u1/);
});

test("apagar: operador 403; dono apaga atendimentos e ficha da loja", async () => {
  papel = "operator";
  assert.equal((await DELETE(pedir("DELETE", `/api/ig/contacts/${ID}`), comId(ID))).status, 403);
  assert.deepEqual(escritas(), []);
  papel = "owner";
  const r = await DELETE(pedir("DELETE", `/api/ig/contacts/${ID}`), comId(ID));
  assert.equal(r.status, 200);
  const apagadas = escritas().map((c) => [c.url.pathname, c.url.searchParams.get("tenant_id")]);
  assert.deepEqual(apagadas, [["/rest/v1/ig_runs", "eq.loja-b"], ["/rest/v1/ig_contacts", "eq.loja-b"]]);
});

test("CSV: operador 403; dono baixa, com aspas dobradas e fórmula neutralizada", async () => {
  campos = { nota: '=HYPERLINK("x")' };
  papel = "operator";
  assert.equal((await EXPORTAR(pedir("GET", "/api/ig/contacts/export"))).status, 403);
  papel = "admin";
  const r = await EXPORTAR(pedir("GET", "/api/ig/contacts/export?recencia=7d"));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(r.headers.get("content-disposition") ?? "", /attachment; filename="pessoas-instagram-\d{4}-\d{2}-\d{2}\.csv"/);
  const texto = await r.text();
  assert.ok(texto.includes(`"'=HYPERLINK(""x"")"`), texto);
  const lista = chamadas.find((c) => c.url.pathname === "/rest/v1/ig_contacts" && c.metodo === "GET");
  assert.equal(lista?.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.match(lista?.url.searchParams.get("last_seen_at") ?? "", /^gte\./);
});

test("depois de cancelar (10 dias): dono lê e exporta; editar, etiquetar e apagar dão 403 só leitura", async () => {
  ligado = false;
  desligadoEm = dias(10);
  const lista = await LISTA(pedir("GET", "/api/ig/contacts"));
  assert.equal(lista.status, 200);
  const corpo = await lista.json();
  assert.equal(corpo.acesso.somenteLeitura, true);
  assert.equal(corpo.acesso.podeApagar, false);
  assert.equal(typeof corpo.acesso.fichasSomemEm, "string");
  assert.equal((await EXPORTAR(pedir("GET", "/api/ig/contacts/export"))).status, 200);
  for (const r of [
    await PATCH(pedir("PATCH", `/api/ig/contacts/${ID}`, { add: ["vip"] }), comId(ID)),
    await DELETE(pedir("DELETE", `/api/ig/contacts/${ID}`), comId(ID)),
    await BULK(pedir("POST", "/api/ig/contacts/bulk-tags", { ids: [ID], add: ["vip"] })),
  ]) {
    assert.equal(r.status, 403);
    assert.equal((await r.json()).code, "instagram_read_only");
  }
  assert.deepEqual(escritas(), []);
});

test("cancelado há mais de 30 dias, sem carimbo, ou operador na janela: 403 instagram_disabled", async () => {
  ligado = false;
  desligadoEm = dias(31);
  assert.equal((await LISTA(pedir("GET", "/api/ig/contacts"))).status, 403);
  desligadoEm = null;
  assert.equal((await LISTA(pedir("GET", "/api/ig/contacts"))).status, 403);
  desligadoEm = dias(5);
  papel = "operator";
  const r = await LISTA(pedir("GET", "/api/ig/contacts"));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, "instagram_disabled");
});

test("entrada inválida é 400: filtro, etiqueta, corpo de etiqueta em massa", async () => {
  assert.equal((await LISTA(pedir("GET", "/api/ig/contacts?recencia=ontem"))).status, 400);
  assert.equal((await LISTA(pedir("GET", "/api/ig/contacts?campo=tamanho"))).status, 400, "campo sem valor");
  assert.equal((await LISTA(pedir("GET", "/api/ig/contacts?pagina=0"))).status, 400);
  assert.equal((await PATCH(pedir("PATCH", `/api/ig/contacts/${ID}`, { add: ["!!!"] }), comId(ID))).status, 400);
  assert.equal((await PATCH(pedir("PATCH", `/api/ig/contacts/${ID}`, { set: { "Chave Ruim": "x" } }), comId(ID))).status, 400);
  assert.equal((await BULK(pedir("POST", "/api/ig/contacts/bulk-tags", { add: ["vip"] }))).status, 400, "sem alvo seria a loja inteira");
  assert.equal((await BULK(pedir("POST", "/api/ig/contacts/bulk-tags", { ids: [ID] }))).status, 400, "sem etiqueta nenhuma");
  assert.deepEqual(escritas(), []);
});

test("operador edita campo e etiqueta; a gravação vai pelo apply atômico da loja da sessão", async () => {
  papel = "operator";
  const r = await PATCH(pedir("PATCH", `/api/ig/contacts/${ID}`, { set: { tamanho: null }, add: ["Quer Infantil"] }), comId(ID));
  assert.equal(r.status, 200);
  const apply = chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/ig_contact_apply");
  assert.deepEqual(apply?.corpo, { p_tenant: "loja-b", p_ig_user_id: "u1", p_username: "ana", p_set: { tamanho: null }, p_add: ["quer-infantil"], p_remove: [], p_seen_at: "2026-11-02T00:00:00Z", p_dm: false, p_source_flow: null });
});

test("etiqueta em massa por ids grava só fichas da loja", async () => {
  const r = await BULK(pedir("POST", "/api/ig/contacts/bulk-tags", { ids: [ID], add: ["vip"], remove: ["frio"] }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).atualizadas, 1);
  const leitura = chamadas.find((c) => c.url.pathname === "/rest/v1/ig_contacts");
  assert.equal(leitura?.url.searchParams.get("tenant_id"), "eq.loja-b");
});
