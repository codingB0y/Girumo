// apps/web/src/app/api/link-da-bio/route.test.ts
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, mock, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { CorpoDoPatchBio, ErroDoPainelBio, RespostaDoSlug } from "@/lib/bio/painel-api";
import { getPublicSiteUrl } from "@/lib/brand";
import { dayBR, dayBRAgo } from "@/lib/date-br";
import type { PaginaBio } from "@/lib/stores/bio-pages";

/**
 * As rotas do painel do link da bio contra um PostgREST de mentira que entende o básico
 * (filtros eq/neq/in/is, objeto único, insert, update) e imita o unique de `bio_pages` e o
 * gatilho de `bio_slugs` (spec 2026-10-19-link-da-bio §5). Prova o que a rota faz com o
 * banco — inclusive o filtro de loja — sem depender de como o PR 2 escreveu cada consulta.
 * Molde: api/anuncios/gasto/route.test.ts. Dados fictícios: nada da loja-piloto.
 */

type Linha = Record<string, unknown>;
type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resultado = [status: number, corpo: unknown];
type Cabecalhos = Record<string, string>;
type Rota = (req: Request) => Promise<Response>;

const LOJA = "0d6f3c1e-5b2a-4c8e-9f10-2a3b4c5d6e7f";
const OUTRA = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
/**
 * Lojas do mesmo usuário com balde de rate limit só delas: sem Upstash o balde é em memória e dura o
 * processo, então a RAJADA esgota o limite e a FORMATO leva os 400 em série sem gastar o da LOJA.
 */
const RAJADA = "e1d2c3b4-a596-4877-8695-a4b3c2d1e0f9";
const FORMATO = "f0e1d2c3-b4a5-4968-8776-95a4b3c2d1e0";
const PAGINA = "3c2b1a0f-9e8d-4c7b-8a69-5f4e3d2c1b0a";
const PAGINA_DA_OUTRA = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
const VIP = "1f2e3d4c-5b6a-4798-8a7b-6c5d4e3f2a1b";
const INVERNO = "2a3b4c5d-6e7f-4801-9a2b-3c4d5e6f7a8b";
const DA_OUTRA = "4b5c6d7e-8f90-4a1b-8c2d-3e4f5a6b7c8d";
const SUMIDA = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const LINK_GRUPO = "6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a";
const LINK_SUMIDO = "7f8a9b0c-1d2e-4f3a-8b4c-5d6e7f8a9b0c";
const LINK_WHATS = "8e9f0a1b-2c3d-4e5f-9a6b-7c8d9e0f1a2b";
const NOME = "Ateliê Ouro & Prata";
const AGORA = "2026-10-19T12:00:00.000Z";
/** O número com que a loja posta nos grupos (`instances.phone`), sem o nono dígito. */
const CONECTADO = "556288887777";
const SESSAO: Cabecalhos = { authorization: "Bearer token-falso", "x-tenant-id": LOJA };
const RELATORIO = {
  visitas: 42,
  toques: 17,
  porLink: [{ linkId: LINK_GRUPO, toques: 17 }],
  porDia: [{ dia: "2026-10-18", visitas: 42, toques: 17 }],
};

const chamadas: Chamada[] = [];
let banco: Record<string, Linha[]> = {};
let papel = "owner";
/** Banco fora: tudo menos sessão e membership responde 500, com detalhe que não pode vazar. */
let falhar = false;
/** A página da loja some entre a leitura da rota e o UPDATE (corrida): o store relê e não acha. */
let sumirNoUpdate = false;

function link(id: string, campanhaId: string, destaque = false): LinkBio {
  return { id, tipo: "grupo", titulo: "Entrar no grupo VIP", sub: "", icone: "coroa", ativo: true, destaque, campanhaId };
}

function whats(id: string, numero: string): LinkBio {
  return { id, tipo: "whatsapp", titulo: "Falar com a loja", sub: "", icone: "whatsapp", ativo: true, destaque: false, numero, mensagem: "" };
}

function documento(links: LinkBio[] = [link(LINK_GRUPO, VIP, true)]): DocumentoBio {
  return { ...documentoPadrao({ nome: NOME, campanhaId: null }), links };
}

function pagina(tenantId: string, id: string, slug: string, extra: Linha = {}): Linha {
  return {
    id, tenant_id: tenantId, slug, publicada: false, bloqueada_em: null, documento: documento(),
    versao: 3, created_at: AGORA, updated_at: AGORA, ...extra,
  };
}

function campanha(id: string, nome: string, slug: string, tenantId = LOJA): Linha {
  return {
    id, tenant_id: tenantId, name: nome, slug, group_ids: [], auto_grow: false, grow_template: null,
    metadata: {}, whatsapp_community_jid: null, created_at: AGORA, updated_at: AGORA,
  };
}

function linkMestre(campanhaId: string, slug: string, tenantId = LOJA): Linha {
  return {
    id: randomUUID(), tenant_id: tenantId, campaign_group_id: campanhaId, slug, target_url: "",
    clicks: 0, metadata: { master: true }, created_at: AGORA, updated_at: AGORA,
  };
}

/** A loja sem página; a outra loja com página no ar e um slug antigo. */
function bancoInicial(): Record<string, Linha[]> {
  return {
    bio_pages: [pagina(OUTRA, PAGINA_DA_OUTRA, "atelie-concorrente", { publicada: true })],
    bio_slugs: [
      { slug: "atelie-concorrente", pagina_id: PAGINA_DA_OUTRA, criado_em: AGORA },
      { slug: "concorrente-antigo", pagina_id: PAGINA_DA_OUTRA, criado_em: AGORA },
    ],
    // Na ordem do store (a mais recente primeiro). "Inverno" é de antes do link mestre.
    campaign_groups: [
      campanha(INVERNO, "Inverno", "inverno"),
      campanha(VIP, "VIP Atacado", "vip-atacado"),
      campanha(DA_OUTRA, "VIP da outra", "vip-da-outra", OUTRA),
    ],
    tracked_links: [linkMestre(VIP, "vip-atacado"), linkMestre(DA_OUTRA, "vip-da-outra", OUTRA)],
    instances: [
      { id: randomUUID(), tenant_id: LOJA, name: "Loja", phone: CONECTADO, purpose: "grupos", status: "connected", provider: "evolution", metadata: {}, created_at: AGORA, updated_at: AGORA },
    ],
    custom_domains: [
      { tenant_id: LOJA, hostname: "links.atelie-ficticio.test", verification_token: "t", status: "active", last_error: null, checked_at: AGORA, verified_at: AGORA },
    ],
    organizations: [
      { id: LOJA, name: NOME, niche: null, status: "active" },
      { id: OUTRA, name: "Concorrente", niche: null, status: "active" },
    ],
    uploads: [],
  };
}

/** A loja com página: slug atual "atelie-ouro-prata", um antigo dela ("atelie-antigo"), versão 3. */
function comPagina(extra: Linha = {}): void {
  banco.bio_pages.push(pagina(LOJA, PAGINA, "atelie-ouro-prata", extra));
  banco.bio_slugs.push(
    { slug: "atelie-ouro-prata", pagina_id: PAGINA, criado_em: AGORA },
    { slug: "atelie-antigo", pagina_id: PAGINA, criado_em: AGORA },
  );
}

// ---- PostgREST de mentira ----

const NAO_FILTRA = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

/** Os operadores que os stores usam. Outro estoura: o teste acusa "falso: filtro …" em vez de passar errado. */
function passa(linha: Linha, url: URL): boolean {
  for (const [coluna, filtro] of url.searchParams) {
    if (NAO_FILTRA.has(coluna)) continue;
    const valor = linha[coluna];
    if (filtro.startsWith("eq.")) {
      if (String(valor) !== filtro.slice(3)) return false;
    } else if (filtro.startsWith("neq.")) {
      if (String(valor) === filtro.slice(4)) return false;
    } else if (filtro.startsWith("in.(")) {
      const lista = filtro.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!lista.includes(String(valor))) return false;
    } else if (filtro === "is.null") {
      if (valor !== null && valor !== undefined) return false;
    } else if (filtro === "not.is.null") {
      if (valor === null || valor === undefined) return false;
    } else {
      throw new Error(`falso: filtro ${coluna}=${filtro}`);
    }
  }
  return true;
}

/** `Accept: application/vnd.pgrst.object+json` (`.single()`): exatamente uma linha, senão 406. */
function umOuVarios(linhas: Linha[], objeto: boolean): Resultado {
  if (!objeto) return [200, linhas];
  if (linhas.length === 1) return [200, linhas[0]];
  return [406, { code: "PGRST116", details: `The result contains ${linhas.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }];
}

function duplicada(mensagem: string): Resultado {
  return [409, { code: "23505", details: null, hint: null, message: mensagem }];
}

/** O unique de `bio_pages.slug` e o gatilho `bio_pages_registra_slug` (PR 1): slug de outra página, atual ou antigo, recusa. */
function slugRecusado(slug: unknown, paginaId: unknown): Resultado | null {
  if (banco.bio_pages.some((p) => p.slug === slug && p.id !== paginaId)) {
    return duplicada('duplicate key value violates unique constraint "bio_pages_slug_key"');
  }
  const usado = banco.bio_slugs.find((s) => s.slug === slug);
  // Mensagem do gatilho do PR 1: cita bio_slugs, nunca bio_pages_tenant_id_key.
  return usado && usado.pagina_id !== paginaId ? duplicada(`bio_slugs: o slug "${String(slug)}" já foi de outra página`) : null;
}

function registrarSlug(p: Linha): void {
  if (!banco.bio_slugs.some((s) => s.slug === p.slug)) {
    banco.bio_slugs = [...banco.bio_slugs, { slug: p.slug, pagina_id: p.id, criado_em: AGORA }];
  }
}

function inserir(tabela: string, corpo: unknown, objeto: boolean): Resultado {
  if (tabela !== "bio_pages") return [500, { message: `falso: insert em ${tabela}` }];
  const nova: Linha = {
    id: randomUUID(), publicada: false, bloqueada_em: null, versao: 1, created_at: AGORA, updated_at: AGORA,
    ...((Array.isArray(corpo) ? corpo[0] : corpo) as Linha),
  };
  if (banco.bio_pages.some((p) => p.tenant_id === nova.tenant_id)) {
    return duplicada('duplicate key value violates unique constraint "bio_pages_tenant_id_key"');
  }
  const recusa = slugRecusado(nova.slug, nova.id);
  if (recusa) return recusa;
  banco.bio_pages = [...banco.bio_pages, nova];
  registrarSlug(nova);
  return umOuVarios([nova], objeto);
}

function atualizar(tabela: string, url: URL, corpo: unknown, objeto: boolean): Resultado {
  if (tabela !== "bio_pages") return [500, { message: `falso: update em ${tabela}` }];
  if (sumirNoUpdate) banco.bio_pages = banco.bio_pages.filter((p) => p.tenant_id !== LOJA);
  const mudanca = corpo as Linha;
  const alvos = banco.bio_pages.filter((p) => passa(p, url));
  for (const p of alvos) {
    const recusa = "slug" in mudanca ? slugRecusado(mudanca.slug, p.id) : null;
    if (recusa) return recusa;
  }
  const novas = alvos.map((p) => ({ ...p, ...mudanca }));
  banco.bio_pages = banco.bio_pages.map((p) => novas.find((n) => n.id === p.id) ?? p);
  novas.forEach(registrarSlug);
  return umOuVarios(novas, objeto);
}

function responder(metodo: string, url: URL, corpo: unknown, objeto: boolean): Resultado {
  const { pathname } = url;
  if (pathname === "/auth/v1/user") return [200, { id: "usuario-1", email: "dono@loja.test" }];
  if (pathname === "/rest/v1/memberships") {
    // Membership na LOJA, na RAJADA e na FORMATO: x-tenant-id de outra loja não acha nada (403).
    const pedida = url.searchParams.get("tenant_id");
    for (const extra of [RAJADA, FORMATO]) {
      if (pedida === `eq.${extra}`) return [200, [{ tenant_id: extra, role: papel, modules: [] }]];
    }
    const minha = pedida === null || pedida === `eq.${LOJA}`;
    return [200, minha ? [{ tenant_id: LOJA, role: papel, modules: [] }] : []];
  }
  if (falhar) return [500, { code: "XX000", message: "segredo do banco" }];
  if (pathname === "/rest/v1/rpc/bio_relatorio") return [200, RELATORIO];
  const tabela = pathname.replace(/^\/rest\/v1\//, "");
  if (!(tabela in banco)) return [500, { message: `falso: inesperado ${metodo} ${pathname}` }];
  if (metodo === "GET") return umOuVarios(banco[tabela].filter((l) => passa(l, url)), objeto);
  if (metodo === "POST") return inserir(tabela, corpo, objeto);
  if (metodo === "PATCH") return atualizar(tabela, url, corpo, objeto);
  return [500, { message: `falso: inesperado ${metodo} ${pathname}` }];
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpo: unknown = bruto ? JSON.parse(bruto) : undefined;
    chamadas.push({ metodo: req.method ?? "", url, corpo });
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    let resultado: Resultado;
    try {
      resultado = responder(req.method ?? "", url, corpo, objeto);
    } catch (e) {
      resultado = [500, { message: (e as Error).message }];
    }
    res.statusCode = resultado[0];
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resultado[1]));
  });
});

// ---- Rotas e pedidos ----

let GET: Rota;
let POST: Rota;
let PATCH: Rota;
let getSlug: Rota;
let getRelatorio: Rota;
/** O pedaço do `workAsyncStorage` do Next que o teste usa (Next 15.5). */
type ContextoDoNext = { run<T>(store: never, fn: () => T): T };
let contextoDoNext: ContextoDoNext;

/** Cada handler da série com um pedido válido: a recusa de sessão, loja ou papel vem antes de qualquer validação. */
const HANDLERS: Array<[nome: string, chamar: (cabecalhos: Cabecalhos) => Promise<Response>]> = [
  ["GET /api/link-da-bio", (h) => GET(pedir("GET", undefined, undefined, h))],
  ["POST /api/link-da-bio", (h) => POST(pedir("POST", undefined, undefined, h))],
  ["PATCH /api/link-da-bio", (h) => PATCH(pedir("PATCH", undefined, corpoValido(), h))],
  ["GET /api/link-da-bio/slug", (h) => getSlug(pedir("GET", "/api/link-da-bio/slug?valor=atelie-novo", undefined, h))],
  ["GET /api/link-da-bio/relatorio", (h) => getRelatorio(pedir("GET", "/api/link-da-bio/relatorio?dias=7", undefined, h))],
];

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  // O Next só usa a AsyncLocalStorage real se ela estiver no globalThis antes do primeiro import
  // dele (a rota importa `next/cache` pelo `invalidarBio`): por isso os imports são dinâmicos.
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
  contextoDoNext = (await import("next/dist/server/app-render/work-async-storage.external")).workAsyncStorage;
  ({ GET, POST, PATCH } = await import("./route"));
  ({ GET: getSlug } = await import("./slug/route"));
  ({ GET: getRelatorio } = await import("./relatorio/route"));
});
after(() => {
  supabase.close();
});
beforeEach(() => {
  chamadas.length = 0;
  banco = bancoInicial();
  papel = "owner";
  falhar = false;
  sumirNoUpdate = false;
});

function pedir(metodo: string, caminho = "/api/link-da-bio", corpo?: unknown, cabecalhos: Cabecalhos = SESSAO): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { ...cabecalhos, "content-type": "application/json" },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

/** Só sessão e membership foram consultadas: a recusa veio antes de ler ou gravar qualquer coisa da loja. */
function soTocouNaSessao(): boolean {
  return chamadas.every((c) => c.url.pathname === "/auth/v1/user" || c.url.pathname === "/rest/v1/memberships");
}

/** Tabelas com `tenant_id` que o painel lê ou grava. */
const COM_LOJA = new Set(["bio_pages", "campaign_groups", "tracked_links", "custom_domains", "instances", "uploads"]);

/** Toda leitura e gravação levou a loja da sessão: o service role passa por cima do RLS. */
function soDaLoja(): void {
  for (const c of chamadas) {
    const tabela = c.url.pathname.replace(/^\/rest\/v1\//, "");
    const onde = `${c.metodo} ${tabela}`;
    if (COM_LOJA.has(tabela) && c.metodo === "POST") {
      assert.equal(((Array.isArray(c.corpo) ? c.corpo[0] : c.corpo) as Linha).tenant_id, LOJA, onde);
    } else if (COM_LOJA.has(tabela)) {
      assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`, onde);
    } else if (tabela === "organizations") {
      assert.equal(c.url.searchParams.get("id"), `eq.${LOJA}`, onde);
    } else if (tabela === "rpc/bio_relatorio") {
      assert.equal((c.corpo as Linha).p_tenant, LOJA, onde);
    }
  }
}

function corpoValido(extra: Partial<CorpoDoPatchBio> = {}): CorpoDoPatchBio {
  return { versao: 3, slug: "atelie-ouro-prata", publicada: true, documento: documento(), ...extra };
}

/** O corpo válido com o único link (o botão do grupo) alterado — inclusive para algo que o tipo não deixa. */
function comLink(campos: Linha): CorpoDoPatchBio {
  return corpoValido({ documento: documento([{ ...link(LINK_GRUPO, VIP, true), ...campos } as LinkBio]) });
}

/**
 * Roda o handler como dentro de uma request do Next e devolve as tags que ele invalidou. Fora disso,
 * o `revalidateTag` lança ("static generation store missing"). Usa interno do Next 15.5
 * (`pendingRevalidatedTags`): numa atualização, este teste quebra alto, não calado.
 */
async function comCacheDoNext(fn: () => Promise<Response>): Promise<{ resposta: Response; tags: string[] }> {
  const store: { incrementalCache: object; pendingRevalidatedTags?: string[] } = { incrementalCache: {} };
  const resposta = await contextoDoNext.run(store as never, fn);
  return { resposta, tags: store.pendingRevalidatedTags ?? [] };
}

const gravouPagina = () => chamadas.some((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/bio_pages");

// ---- Transversais: valem para todo handler em HANDLERS ----

test("sem sessão: 401 em todo handler, e nada da loja é lido", async () => {
  for (const [nome, chamar] of HANDLERS) {
    chamadas.length = 0;
    assert.equal((await chamar({})).status, 401, nome);
    assert.ok(soTocouNaSessao(), nome);
  }
});

test("vendedora: 403 do guard de módulo em todo handler, antes de tocar no banco", async () => {
  // /api/link-da-bio não está em lib/auth/modulos.ts: o mapa é fechado por padrão (spec §8).
  papel = "seller";
  for (const [nome, chamar] of HANDLERS) {
    chamadas.length = 0;
    const r = await chamar(SESSAO);
    assert.equal(r.status, 403, nome);
    assert.equal(await r.text(), MENSAGEM_BLOQUEIO, nome);
    assert.ok(soTocouNaSessao(), nome);
  }
});

test("x-tenant-id de loja da qual o usuário não é membro: 403, nada lido", async () => {
  for (const [nome, chamar] of HANDLERS) {
    chamadas.length = 0;
    assert.equal((await chamar({ ...SESSAO, "x-tenant-id": OUTRA })).status, 403, nome);
    assert.ok(soTocouNaSessao(), nome);
  }
});

test("banco fora: 500 com mensagem nossa, nunca a do banco", async () => {
  falhar = true;
  const silencio = mock.method(console, "error", () => {});
  try {
    for (const [nome, chamar] of HANDLERS) {
      const r = await chamar(SESSAO);
      assert.equal(r.status, 500, nome);
      const texto = await r.text();
      assert.doesNotMatch(texto, /segredo/, nome);
      assert.equal(typeof (JSON.parse(texto) as { error?: unknown }).error, "string", nome);
    }
  } finally {
    silencio.mock.restore();
  }
});

// ---- GET ----

test("GET sem página: campanhas com o slug do link mestre, domínio ativo, origem Girumo e endereço livre", async () => {
  const r = await GET(pedir("GET"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), {
    // A outra loja tem página: a desta loja continua null.
    pagina: null,
    campanhas: [
      { id: INVERNO, nome: "Inverno", slug: null },
      { id: VIP, nome: "VIP Atacado", slug: "vip-atacado" },
    ],
    dominio: "links.atelie-ficticio.test",
    origemGirumo: getPublicSiteUrl(),
    sugestaoSlug: "atelie-ouro-prata",
    linksEscondidos: [],
  });
  // Link mestre buscado pelos slugs das campanhas da loja (`linksMestresDasCampanhas`), sem o corte
  // de 1000 linhas de ler todos os links: um pedido, com a loja e os dois slugs.
  const links = chamadas.filter((c) => c.url.pathname === "/rest/v1/tracked_links");
  assert.equal(links.length, 1);
  assert.equal(links[0].url.searchParams.get("slug"), "in.(inverno,vip-atacado)");
  soDaLoja();
});

test("GET com página: a da loja, a sugestão é o próprio slug e os links que a página pública esconde", async () => {
  comPagina({ bloqueada_em: AGORA, documento: documento([link(LINK_GRUPO, VIP, true), link(LINK_SUMIDO, SUMIDA)]) });
  banco.custom_domains = banco.custom_domains.map((d) => ({ ...d, status: "pending" }));
  const corpo = (await (await GET(pedir("GET"))).json()) as { pagina: PaginaBio; dominio: string | null; sugestaoSlug: string; linksEscondidos: string[] };
  assert.deepEqual([corpo.pagina.id, corpo.pagina.tenantId, corpo.pagina.versao], [PAGINA, LOJA, 3]);
  // Bloqueada pelo admin: a API repassa, o painel avisa (spec §2).
  assert.equal(corpo.pagina.bloqueadaEm, AGORA);
  assert.equal(corpo.sugestaoSlug, "atelie-ouro-prata");
  // Campanha sumida: o botão sai da página pública e o painel pinta de vermelho.
  assert.deepEqual(corpo.linksEscondidos, [LINK_SUMIDO]);
  // Domínio ainda pendente não é endereço.
  assert.equal(corpo.dominio, null);
  soDaLoja();
});

test("GET: nome com girumo sugere raiz \"loja\"; endereço ocupado por outra loja ganha sufixo", async () => {
  banco.organizations = [{ id: LOJA, name: "Girumo Modas", niche: null, status: "active" }];
  const comMarca = (await (await GET(pedir("GET"))).json()) as { sugestaoSlug: string };
  assert.match(comMarca.sugestaoSlug, /^loja-[a-hjkmnp-z2-9]{4}$/);

  banco.organizations = [{ id: LOJA, name: "WhatsApp Kids Oficial", niche: null, status: "active" }];
  const comPlataforma = (await (await GET(pedir("GET"))).json()) as { sugestaoSlug: string };
  assert.match(comPlataforma.sugestaoSlug, /^loja-[a-hjkmnp-z2-9]{4}$/);

  banco.organizations = [{ id: LOJA, name: NOME, niche: null, status: "active" }];
  banco.bio_slugs.push({ slug: "atelie-ouro-prata", pagina_id: PAGINA_DA_OUTRA, criado_em: AGORA });
  const ocupado = (await (await GET(pedir("GET"))).json()) as { sugestaoSlug: string };
  assert.match(ocupado.sugestaoSlug, /^atelie-ouro-prata-[a-hjkmnp-z2-9]{4}$/);
});

// ---- POST ----

test("POST cria fora do ar, com o modelo padrão, o nome da loja e o primeiro link mestre", async () => {
  const r = await POST(pedir("POST"));
  assert.equal(r.status, 201);
  const criada = (await r.json()) as PaginaBio;
  assert.equal(criada.tenantId, LOJA);
  assert.equal(criada.slug, "atelie-ouro-prata");
  assert.equal(criada.publicada, false);
  assert.deepEqual([criada.documento.modelo, criada.documento.paleta, criada.documento.perfil.nome], ["etiqueta", "azul", NOME]);
  // "Inverno" vem antes na lista, mas não tem link mestre: o botão vai para o VIP.
  assert.deepEqual(criada.documento.links.flatMap((l) => (l.tipo === "grupo" ? [l.campanhaId] : [])), [VIP]);
  assert.equal(banco.bio_pages.filter((p) => p.tenant_id === LOJA).length, 1);
  soDaLoja();
});

test("POST é idempotente: com página, devolve a que existe e não grava nada", async () => {
  comPagina();
  const r = await POST(pedir("POST"));
  assert.equal(r.status, 201);
  assert.equal(((await r.json()) as PaginaBio).id, PAGINA);
  assert.equal(chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/bio_pages").length, 0);
});

test("POST: dois cliques ao mesmo tempo dão a mesma página, nunca duas", async () => {
  const [a, b] = await Promise.all([POST(pedir("POST")), POST(pedir("POST"))]);
  assert.deepEqual([a.status, b.status], [201, 201]);
  assert.equal(((await a.json()) as PaginaBio).id, ((await b.json()) as PaginaBio).id);
  assert.equal(banco.bio_pages.filter((p) => p.tenant_id === LOJA).length, 1);
});

test("POST sem campanha com link mestre: a página nasce sem o botão do grupo", async () => {
  banco.tracked_links = [];
  const criada = (await (await POST(pedir("POST"))).json()) as PaginaBio;
  assert.equal(criada.documento.links.some((l) => l.tipo === "grupo"), false);
});

test("POST com nome de 80 caracteres e emoji no corte: cria, com o nome cortado sem meio emoji", async () => {
  // organizations.name vai até 80 (STORE_NAME_MAX); o corte em 60 é do documentoPadrao (PR 2).
  banco.organizations = [{ id: LOJA, name: `${"A".repeat(59)}🌸 Moda Atacado Sul`, niche: null, status: "active" }];
  const r = await POST(pedir("POST"));
  assert.equal(r.status, 201);
  const { perfil } = ((await r.json()) as PaginaBio).documento;
  assert.ok(perfil.nome.length <= 60, perfil.nome);
  // Surrogate alto solto no fim é JSON que o jsonb recusa.
  assert.doesNotMatch(perfil.nome, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test("POST: dono, administração e operação criam (campaign:edit)", async () => {
  for (const p of ["owner", "admin", "operator"]) {
    papel = p;
    banco = bancoInicial();
    assert.equal((await POST(pedir("POST"))).status, 201, p);
  }
});

// ---- PATCH ----

test("PATCH salva a página inteira, sobe a versão e invalida o slug novo e o antigo", async () => {
  comPagina();
  const { resposta: r, tags } = await comCacheDoNext(() => PATCH(pedir("PATCH", undefined, corpoValido({ slug: "ouro-prata-atacado" }))));
  assert.equal(r.status, 200);
  const salva = (await r.json()) as PaginaBio;
  assert.deepEqual([salva.id, salva.slug, salva.versao, salva.publicada], [PAGINA, "ouro-prata-atacado", 4, true]);
  // Tags da spec §6: o antigo passa a responder 301; o novo pode ter um 404 guardado.
  for (const tag of ["bio-slug:ouro-prata-atacado", "bio-slug:atelie-ouro-prata", `bio-loja:${LOJA}`, `bio-pagina:${PAGINA}`]) {
    assert.ok(tags.includes(tag), `${tag} em ${JSON.stringify(tags)}`);
  }
  soDaLoja();
});

test("PATCH volta a um endereço que já foi da própria loja", async () => {
  comPagina();
  const { resposta: r } = await comCacheDoNext(() => PATCH(pedir("PATCH", undefined, corpoValido({ slug: "atelie-antigo" }))));
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as PaginaBio).slug, "atelie-antigo");
});

test("PATCH recusa corpo fora do formato com 400 e o campo, sem gravar", async () => {
  comPagina();
  const casos: Array<[corpo: unknown, campo: string | undefined]> = [
    ["não é json", undefined],
    [{ ...corpoValido(), tenant_id: OUTRA }, undefined],
    [{ ...corpoValido(), versao: 0 }, "versao"],
    [{ ...corpoValido(), versao: "3" }, "versao"],
    [{ ...corpoValido(), publicada: "sim" }, "publicada"],
    [{ ...corpoValido(), documento: undefined }, "documento"],
    // Chave a mais na raiz do documento: o PR 2 aponta caminho vazio, a API responde "documento".
    [{ ...corpoValido(), documento: { ...documento(), extra: 1 } }, "documento"],
    [{ ...corpoValido(), documento: { ...documento(), modelo: "neon" } }, "modelo"],
    [corpoValido({ slug: "Ouro Prata" }), "slug"],
    [corpoValido({ slug: "ab" }), "slug"],
    [corpoValido({ slug: "a".repeat(41) }), "slug"],
    [corpoValido({ slug: "girumo-ouro" }), "slug"],
    [corpoValido({ slug: "admin" }), "slug"],
    // O link vai inteiro para o jsonb: NUL e metade de emoji dariam 500 no Postgres.
    [comLink({ titulo: "VIP\u0000" }), "links.0.titulo"],
    [comLink({ titulo: "VIP \uD83C" }), "links.0.titulo"],
    [comLink({ id: LINK_GRUPO.toUpperCase() }), "links.0.id"],
    [comLink({ campanhaId: "x" }), "links.0.campanhaId"],
    [comLink({ extra: 1 }), "links.0"],
  ];
  for (const [corpo, campo] of casos) {
    // Recusa antes do banco: a loja da sessão não muda nada, e a FORMATO poupa o rate limit da LOJA.
    const r = await PATCH(pedir("PATCH", undefined, corpo, { ...SESSAO, "x-tenant-id": FORMATO }));
    assert.equal(r.status, 400, JSON.stringify(corpo).slice(0, 80));
    const erro = (await r.json()) as ErroDoPainelBio;
    assert.equal(typeof erro.error, "string");
    assert.equal(erro.campo, campo, JSON.stringify(corpo).slice(0, 80));
  }
  assert.equal(gravouPagina(), false);
});

test("PATCH: o número com que a loja posta é recusado (anti-ban), com o campo do link", async () => {
  comPagina();
  // O banco guarda sem o nono dígito, o link vem com: a chave do telefone casa os dois (spec §4).
  const r = await PATCH(pedir("PATCH", undefined, corpoValido({ documento: documento([whats(LINK_WHATS, "5562988887777")]) })));
  assert.equal(r.status, 400);
  const erro = (await r.json()) as ErroDoPainelBio;
  assert.equal(erro.campo, "links.0.numero");
  assert.match(erro.error, /número que a Girumo usa para postar/);
  assert.equal(gravouPagina(), false);
});

test("PATCH: campanha de outra loja no botão do grupo é recusada, sem gravar", async () => {
  comPagina();
  const r = await PATCH(pedir("PATCH", undefined, corpoValido({ documento: documento([link(LINK_GRUPO, DA_OUTRA, true)]) })));
  assert.equal(r.status, 400);
  assert.match(String(((await r.json()) as ErroDoPainelBio).campo), /^links\.0\./);
  assert.equal(gravouPagina(), false);
});

test("PATCH sem página: 404, e nada é gravado", async () => {
  const r = await PATCH(pedir("PATCH", undefined, corpoValido()));
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "Crie a página antes de salvar." });
  assert.equal(gravouPagina(), false);
});

test("PATCH com corpo acima de 64 KB: 413 antes de ler o banco", async () => {
  comPagina();
  const r = await PATCH(pedir("PATCH", undefined, { ...corpoValido(), lixo: "a".repeat(65 * 1024) }));
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), { error: "Pedido grande demais." });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(soTocouNaSessao());
});

test("PATCH: 30 salvamentos por minuto por loja; o 31º é 429, sem tocar no banco", async () => {
  const daRajada: Cabecalhos = { ...SESSAO, "x-tenant-id": RAJADA };
  for (let i = 1; i <= 30; i += 1) {
    assert.equal((await PATCH(pedir("PATCH", undefined, "não é json", daRajada))).status, 400, `salvar ${i}`);
  }
  chamadas.length = 0;
  const r = await PATCH(pedir("PATCH", undefined, corpoValido(), daRajada));
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "Muitas tentativas. Espere um minuto." });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(soTocouNaSessao());
  // O balde é da loja: a outra loja do mesmo usuário segue salvando.
  comPagina();
  assert.equal((await PATCH(pedir("PATCH", undefined, corpoValido()))).status, 200);
});

test("PATCH: a página some entre a leitura e o UPDATE → 404 (\"sem-pagina\" do store)", async () => {
  comPagina();
  sumirNoUpdate = true;
  assert.equal((await PATCH(pedir("PATCH", undefined, corpoValido()))).status, 404);
});

test("PATCH com versão velha: 409 \"versao\", nada muda e o cache não é tocado", async () => {
  comPagina();
  const { resposta: r, tags } = await comCacheDoNext(() => PATCH(pedir("PATCH", undefined, corpoValido({ versao: 2, slug: "ouro-prata-atacado" }))));
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "Outra pessoa salvou antes. Recarregue pra ver a versão nova.", motivo: "versao" });
  assert.deepEqual(tags, []);
  assert.equal(banco.bio_pages.find((p) => p.id === PAGINA)?.slug, "atelie-ouro-prata");
});

test("PATCH com endereço de outra loja, atual ou antigo: 409 \"slug\"", async () => {
  for (const slug of ["atelie-concorrente", "concorrente-antigo"]) {
    banco = bancoInicial();
    comPagina();
    const r = await PATCH(pedir("PATCH", undefined, corpoValido({ slug })));
    assert.equal(r.status, 409, slug);
    assert.deepEqual(await r.json(), { error: "Esse endereço já está em uso. Escolha outro.", motivo: "slug" }, slug);
  }
});

test("PATCH: se invalidar o cache falhar, o salvar vale (200)", async () => {
  comPagina();
  const silencio = mock.method(console, "error", () => {});
  try {
    // Fora do contexto de request do Next, o `revalidateTag` lança.
    assert.equal((await PATCH(pedir("PATCH", undefined, corpoValido()))).status, 200);
  } finally {
    silencio.mock.restore();
  }
});

test("PATCH: versão fora do integer do banco é 400 \"versao\", nunca um 500 do Postgres", async () => {
  // Adição à brief (revisão do PR 2): `bio_pages.versao` é integer e o store grava `versao + 1`.
  comPagina();
  for (const versao of [1.5, -1, 1e20, 2147483647]) {
    const r = await PATCH(pedir("PATCH", undefined, { ...corpoValido(), versao }));
    assert.equal(r.status, 400, String(versao));
    assert.equal(((await r.json()) as ErroDoPainelBio).campo, "versao", String(versao));
  }
  assert.equal(gravouPagina(), false);
});

test("PATCH: banco fora responde 500 genérico, sem vazar o erro", async () => {
  comPagina();
  falhar = true;
  const silencio = mock.method(console, "error", () => {});
  try {
    const r = await PATCH(pedir("PATCH", undefined, corpoValido()));
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "Não deu pra salvar a página." });
  } finally {
    silencio.mock.restore();
  }
});

// ---- slug ----

test("slug: formato e reservado respondem sem consultar o banco", async () => {
  const casos: Array<[valor: string, motivo: "formato" | "reservado"]> = [
    ["", "formato"],
    ["ab", "formato"],
    ["Minha-Loja", "formato"],
    ["minha loja", "formato"],
    ["a".repeat(41), "formato"],
    ["admin", "reservado"],
    ["girumo-moda", "reservado"],
    ["loja-hubflow", "reservado"],
  ];
  for (const [valor, motivo] of casos) {
    const r = await getSlug(pedir("GET", `/api/link-da-bio/slug?valor=${encodeURIComponent(valor)}`));
    assert.equal(r.status, 200, valor);
    assert.deepEqual(await r.json(), { disponivel: false, motivo }, valor);
  }
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/bio_")).length, 0);
});

test("slug: livre; desta loja (atual ou antigo) está livre; de outra loja (atual ou antigo) está em uso", async () => {
  comPagina();
  const casos: Array<[valor: string, esperado: RespostaDoSlug]> = [
    ["atelie-novo", { disponivel: true }],
    ["atelie-ouro-prata", { disponivel: true }],
    ["atelie-antigo", { disponivel: true }],
    ["atelie-concorrente", { disponivel: false, motivo: "em-uso" }],
    ["concorrente-antigo", { disponivel: false, motivo: "em-uso" }],
  ];
  for (const [valor, esperado] of casos) {
    const r = await getSlug(pedir("GET", `/api/link-da-bio/slug?valor=${valor}`));
    assert.deepEqual(await r.json(), esperado, valor);
  }
  soDaLoja();
});

test("slug: 60 consultas por minuto por loja; a 61ª é 429, sem tocar no banco", async () => {
  const daRajada: Cabecalhos = { ...SESSAO, "x-tenant-id": RAJADA };
  for (let i = 1; i <= 60; i += 1) {
    assert.equal((await getSlug(pedir("GET", "/api/link-da-bio/slug?valor=ab", undefined, daRajada))).status, 200, `consulta ${i}`);
  }
  chamadas.length = 0;
  const r = await getSlug(pedir("GET", "/api/link-da-bio/slug?valor=atelie-novo", undefined, daRajada));
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "Muitas tentativas. Espere um minuto." });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(soTocouNaSessao());
  // O balde é da loja: a outra loja do mesmo usuário segue consultando.
  assert.deepEqual(await (await getSlug(pedir("GET", "/api/link-da-bio/slug?valor=atelie-novo"))).json(), { disponivel: true });
});

// ---- relatório ----

test("relatório: 7 e 30 dias contando hoje, da loja da sessão, agregado no banco", async () => {
  for (const [dias, atras] of [["7", 6], ["30", 29]] as const) {
    chamadas.length = 0;
    // A rota lê o relógio sozinha: perto da meia-noite de Brasília o dia pode virar no meio do teste.
    const antes = new Date();
    const r = await getRelatorio(pedir("GET", `/api/link-da-bio/relatorio?dias=${dias}`));
    const depois = new Date();
    assert.equal(r.status, 200, dias);
    assert.deepEqual(await r.json(), RELATORIO);
    const rpc = chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/bio_relatorio");
    const { p_desde, p_ate } = rpc?.corpo as { p_desde: string; p_ate: string };
    assert.ok([dayBR(antes), dayBR(depois)].includes(p_ate), p_ate);
    assert.ok([dayBRAgo(atras, antes), dayBRAgo(atras, depois)].includes(p_desde), p_desde);
    soDaLoja();
  }
});

test("relatório: dias fora de 7 e 30 é 400, sem consultar o banco", async () => {
  for (const consulta of ["", "?dias=", "?dias=14", "?dias=7.0", "?dias=30d"]) {
    const r = await getRelatorio(pedir("GET", `/api/link-da-bio/relatorio${consulta}`));
    assert.equal(r.status, 400, consulta);
    assert.equal(typeof ((await r.json()) as ErroDoPainelBio).error, "string");
  }
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/rpc/")).length, 0);
});
