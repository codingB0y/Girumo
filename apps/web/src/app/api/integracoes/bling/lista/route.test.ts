import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { diaDoBling } from "@/lib/bling/api";

import { GET } from "./route";

/** Dono logado por Bearer contra um PostgREST de mentira que pagina `bling_contacts` como o de verdade. */

type Contato = {
  bling_contact_id: number;
  name: string | null;
  person_type: "F" | "J" | "E" | null;
  phone: string | null;
  phone_key: string | null;
  meta_hashes: Record<string, unknown>;
  lista: string | null;
  fetched_at: string;
};

const chamadas: URL[] = [];
let papel = "owner";
let conexao: Record<string, unknown> | null = null;
let contatos: Contato[] = [];
let contatosQuebrados = false;
/** `optouts` de todas as lojas: o filtro da loja é da consulta. */
let optouts: Array<{ tenant_id: string; phone: string }> = [];
let optoutsQuebrados = false;

/** `gt` + `order asc` + `limit`, como o PostgREST faz com a página por chave. */
function pagina(url: URL): Contato[] {
  const depoisDe = Number(url.searchParams.get("bling_contact_id")?.replace("gt.", ""));
  const lista = url.searchParams.get("lista")?.replace("eq.", "");
  return contatos
    .filter((c) => c.lista === lista && c.bling_contact_id > depoisDe)
    .sort((a, b) => a.bling_contact_id - b.bling_contact_id)
    .slice(0, Number(url.searchParams.get("limit")));
}

/** Descadastro por chave (`phone` > último lido), como `pagina`. */
function paginaDoOptout(url: URL): Array<{ phone: string }> {
  const loja = url.searchParams.get("tenant_id")?.replace("eq.", "");
  const depoisDe = url.searchParams.get("phone")?.replace("gt.", "") ?? "";
  return optouts
    .filter((o) => o.tenant_id === loja && o.phone > depoisDe)
    .sort((a, b) => (a.phone < b.phone ? -1 : 1))
    .slice(0, Number(url.searchParams.get("limit")))
    .map(({ phone }) => ({ phone }));
}

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  chamadas.push(url);
  let status = 500;
  let corpo: unknown = { message: `inesperado: ${req.method} ${url.pathname}` };
  if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
  else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel, modules: [] }]];
  else if (url.pathname === "/rest/v1/bling_connections") [status, corpo] = [200, conexao ? [conexao] : []];
  else if (url.pathname === "/rest/v1/bling_contacts" && !contatosQuebrados) [status, corpo] = [200, pagina(url)];
  else if (url.pathname === "/rest/v1/optouts" && !optoutsQuebrados) [status, corpo] = [200, paginaDoOptout(url)];
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(corpo));
});

const ENV = {
  BLING_CLIENT_ID: "app-girumo",
  BLING_CLIENT_SECRET: "segredo-do-app",
  INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
});
beforeEach(() => {
  Object.assign(process.env, ENV);
  chamadas.length = 0;
  papel = "owner";
  contatosQuebrados = false;
  contatos = [];
  optouts = [];
  optoutsQuebrados = false;
  conexao = {
    tenant_id: "loja-b", company_id: "empresa-1", company_name: "Moda da Ana", status: "ativa", access_token_enc: null,
    refresh_token_enc: null, access_expires_at: null, token_version: 2, situations: [], situations_at: null,
    sale_situation_ids: [9], high_value: null, meta_enabled: true, meta_campaign_id: null, backfill_from: null,
    backfill_until: null, backfill_page: 1, backfill_done_at: null, scan_cursor: null, paused_until: null,
    consecutive_failures: 0, last_webhook_at: null, last_scan_at: null, last_scan_change_at: null, last_sale_at: null,
    last_error: null, last_error_at: null, reconnect_alerted_at: null, connected_at: "2026-10-13T12:00:00+00:00",
  };
});
after(() => {
  supabase.close();
});

function contato(id: number, phoneKey: string | null, hashes: Record<string, unknown>, fetchedAt = "2026-10-10T12:00:00+00:00"): Contato {
  return { bling_contact_id: id, name: `Cliente ${id}`, person_type: "F", phone: null, phone_key: phoneKey, meta_hashes: hashes, lista: "comprador", fetched_at: fetchedAt };
}

function pedir(lista: string | null): Request {
  const consulta = lista === null ? "" : `?l=${lista}`;
  return new Request(`http://girumo.test/api/integracoes/bling/lista${consulta}`, {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

const CABECALHO = "email,email,phone,phone,phone,fn,ln,ct,st,zip,country,doby,dobm,dobd,gen,extern_id";
const linhas = async (resposta: Response) => (await resposta.text()).split("\r\n");
const doBanco = () => chamadas.filter((u) => u.pathname.startsWith("/rest/v1/") && u.pathname !== "/rest/v1/memberships");
const paginas = () => chamadas.filter((u) => u.pathname === "/rest/v1/bling_contacts");
const paginasDoOptout = () => chamadas.filter((u) => u.pathname === "/rest/v1/optouts");

test("CSV da lista: cabeçalho do Meta, cada hash na sua coluna, vazio quando falta, arquivo para baixar", async () => {
  contatos = [
    contato(10, "6299994821", {
      em: ["em1", "em2", "em3"], ph: ["ph1", "ph2", "ph3", "ph4"], fn: "fn1", ln: "ln1", db: "db1",
      ct: "ct1", st: "st1", zp: "zp1", country: "br1", doby: "y1", dobm: "m1", dobd: "d1", ge: "ge1", external_id: "ext1",
    }),
    contato(11, null, { em: ["em9"] }),
    { ...contato(12, "6499993390", { ph: ["phx"] }), lista: "lead" }, // outra lista
  ];

  const resposta = await GET(pedir("comprador"));
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(resposta.headers.get("content-disposition"), `attachment; filename="girumo-comprador-${diaDoBling(new Date())}.csv"`);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  assert.deepEqual(await linhas(resposta), [
    CABECALHO,
    // em[0], em[1], ph[0..2], fn, ln, ct, st, zip, country, doby, dobm, dobd, gen, extern_id — `db` não vai (o CSV usa as partes).
    "em1,em2,ph1,ph2,ph3,fn1,ln1,ct1,st1,zp1,br1,y1,m1,d1,ge1,ext1",
    "em9,,,,,,,,,,,,,,,",
  ]);

  const [primeira] = paginas();
  assert.equal(primeira.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(primeira.searchParams.get("lista"), "eq.comprador");
});

test("uma linha por pessoa (a chave do telefone): fica o contato buscado por último, mesmo em outra página", async () => {
  contatos = Array.from({ length: 1000 }, (_, i) => contato(i + 1, `chave-${i + 1}`, { external_id: `ext-${i + 1}` }));
  // A mesma cliente cadastrada de novo no Bling: o cadastro novo (id 1001, na 2ª página) vale.
  contatos[4] = contato(5, "chave-da-ana", { external_id: "ana-velha" }, "2026-10-01T12:00:00+00:00");
  contatos.push(contato(1001, "chave-da-ana", { external_id: "ana-nova" }, "2026-10-12T09:00:00.123456+00:00"));
  // Buscado por último é o de id menor: a ordem do id não manda.
  contatos[19] = contato(20, "chave-da-bia", { external_id: "bia-nova" }, "2026-10-12T12:00:00+00:00");
  contatos[20] = contato(21, "chave-da-bia", { external_id: "bia-velha" }, "2026-10-02T12:00:00+00:00");
  // Sem telefone, cada contato é uma pessoa.
  contatos.push(contato(1002, null, { external_id: "sem-tel-1" }), contato(1003, null, { external_id: "sem-tel-2" }));

  const texto = await (await GET(pedir("comprador"))).text();
  const corpo = texto.split("\r\n").slice(1);

  // 1000 contatos da 1ª página, menos a Bia repetida, mais os 2 sem telefone; a Ana nova entra no lugar da velha.
  assert.equal(corpo.length, 1001);
  const ext = corpo.map((l) => l.split(",").at(-1));
  assert.ok(ext.includes("ana-nova") && !ext.includes("ana-velha"));
  assert.ok(ext.includes("bia-nova") && !ext.includes("bia-velha"));
  assert.ok(ext.includes("sem-tel-1") && ext.includes("sem-tel-2"));

  // Página por chave, de 1000 em 1000, até vir uma incompleta.
  assert.deepEqual(
    paginas().map((u) => [u.searchParams.get("bling_contact_id"), u.searchParams.get("limit"), u.searchParams.get("order")]),
    [
      ["gt.0", "1000", "bling_contact_id.asc"],
      ["gt.1000", "1000", "bling_contact_id.asc"],
    ],
  );
});

test("descadastro: quem pediu para sair não vai no CSV, com ou sem 55 e o nono dígito; só o da loja conta", async () => {
  contatos = [
    contato(10, "1199990001", { external_id: "saiu-com-55" }),
    contato(11, "1199990002", { external_id: "saiu-sem-o-9" }),
    contato(12, "1199990003", { external_id: "saiu-em-outra-loja" }),
    contato(13, null, { external_id: "sem-telefone" }),
  ];
  optouts = [
    { tenant_id: "loja-b", phone: "5511999990001" },
    { tenant_id: "loja-b", phone: "1199990002" },
    { tenant_id: "loja-x", phone: "5511999990003" },
  ];

  const corpo = (await linhas(await GET(pedir("comprador")))).slice(1);
  assert.deepEqual(corpo.map((l) => l.split(",").at(-1)), ["saiu-em-outra-loja", "sem-telefone"]);
  assert.equal(paginasDoOptout()[0]?.searchParams.get("tenant_id"), "eq.loja-b");
});

test("descadastro com mais de 1000 números: lê por chave até a página incompleta (o PostgREST corta em 1000 sem erro)", async () => {
  contatos = [contato(10, "1199990004", { external_id: "saiu-na-2a-pagina" }), contato(11, "1199990005", { external_id: "fica" })];
  optouts = Array.from({ length: 1000 }, (_, i) => ({ tenant_id: "loja-b", phone: `55119${String(i).padStart(8, "0")}` }));
  optouts.push({ tenant_id: "loja-b", phone: "5511999990004" });

  const corpo = (await linhas(await GET(pedir("comprador")))).slice(1);
  assert.deepEqual(corpo.map((l) => l.split(",").at(-1)), ["fica"]);
  assert.deepEqual(
    paginasDoOptout().map((u) => [u.searchParams.get("phone"), u.searchParams.get("limit"), u.searchParams.get("order")]),
    [
      [null, "1000", "phone.asc"],
      ["gt.5511900000999", "1000", "phone.asc"],
    ],
  );
});

test("descadastro que não carrega: 500, e o CSV não sai sem o filtro", async () => {
  contatos = [contato(10, "1199990001", { external_id: "x" })];
  optoutsQuebrados = true;
  const resposta = await GET(pedir("comprador"));
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("inesperado"));
});

test("RFC 4180: célula com vírgula, aspas ou quebra de linha vai entre aspas, com as aspas dobradas", async () => {
  contatos = [contato(1, "k1", { fn: "x\ny", external_id: 'a,b"c' })];
  const texto = await (await GET(pedir("comprador"))).text();
  assert.equal(texto, `${CABECALHO}\r\n,,,,,"x\ny",,,,,,,,,,"a,b""c"`);
});

test("lista vazia: só o cabeçalho, e uma consulta só", async () => {
  assert.deepEqual(await linhas(await GET(pedir("alto_valor"))), [CABECALHO]);
  assert.equal(paginas().length, 1);
});

test("lista que não existe: 400 sem tocar no banco", async () => {
  for (const lista of [null, "", "todas", "LEAD"]) {
    chamadas.length = 0;
    const resposta = await GET(pedir(lista));
    assert.equal(resposta.status, 400, String(lista));
    assert.deepEqual(await resposta.json(), { error: "Lista inválida." });
    assert.deepEqual(doBanco(), [], String(lista));
  }
});

test("sem conexão ou desconectada: 404 sem ler contato", async () => {
  for (const atual of [null, { ...conexao, status: "desconectada", company_id: null }]) {
    conexao = atual;
    chamadas.length = 0;
    const resposta = await GET(pedir("lead"));
    assert.equal(resposta.status, 404);
    assert.deepEqual(await resposta.json(), { error: "Sem conexão com o Bling." });
    assert.equal(paginas().length, 0);
  }
});

test("sem as variáveis: 503 sem tocar no banco; operador e vendedora: 403", async () => {
  delete process.env.BLING_CLIENT_ID;
  const resposta = await GET(pedir("lead"));
  assert.equal(resposta.status, 503);
  assert.deepEqual(await resposta.json(), { error: "indisponivel" });
  assert.deepEqual(doBanco(), []);

  Object.assign(process.env, ENV);
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await GET(pedir("lead"))).status, 403, p);
    assert.deepEqual(doBanco(), [], p);
  }
});

test("banco falhando: 500 sem a mensagem do banco", async () => {
  contatosQuebrados = true;
  const resposta = await GET(pedir("lead"));
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("inesperado"));
});
