import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { documentoPadrao } from "@/lib/bio/documento";
import type * as Store from "./bio-pages";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (padrão de `vendas.test.ts`): a
 * query que sai daqui é a de produção. O service-role passa por cima do RLS, então o que cada
 * teste confere é o filtro — `tenant_id=eq.` em toda query de `bio_pages`, menos as leituras
 * públicas por slug e por id. Respostas imitam o postgrest-js 2.108 (nunca 503/520: ele repete).
 */

type Visto = { metodo: string; url: URL; prefer: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const vistos: Visto[] = [];
let responder: (pedido: Visto) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let texto = "";
  req.on("data", (parte) => (texto += parte));
  req.on("end", () => {
    const pedido: Visto = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: texto ? JSON.parse(texto) : undefined,
    };
    vistos.push(pedido);
    const { status, corpo } = responder(pedido);
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const saida = objeto && Array.isArray(corpo) ? corpo[0] : corpo;
    if (saida !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(saida === undefined ? undefined : JSON.stringify(saida));
  });
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  store = await import("./bio-pages");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  vistos.length = 0;
});

const SELECT = "id,tenant_id,slug,publicada,bloqueada_em,documento,versao,updated_at";
const params = (url: URL) => Object.fromEntries(url.searchParams);
const DOC = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });
const LINHA = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  tenant_id: "loja-a",
  slug: "loja-exemplo",
  publicada: true,
  bloqueada_em: null,
  documento: DOC,
  versao: 3,
  updated_at: "2026-10-19T12:00:00.000Z",
};
const PAGINA = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  tenantId: "loja-a",
  slug: "loja-exemplo",
  publicada: true,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};

const ERRO = {
  loja: { code: "23505", message: 'duplicate key value violates unique constraint "bio_pages_tenant_id_key"', details: "Key (tenant_id)=(loja-a) already exists.", hint: null },
  slugAtual: { code: "23505", message: 'duplicate key value violates unique constraint "bio_pages_slug_key"', details: "Key (slug)=(loja-exemplo) already exists.", hint: null },
  slugAntigo: { code: "23505", message: 'bio_slugs: o slug "loja-exemplo" já foi de outra página', details: null, hint: null },
  outroUnique: { code: "23505", message: 'duplicate key value violates unique constraint "outra_coisa_key"', details: null, hint: null },
};

test("lê a página da loja só com o tenant e devolve em camelCase", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.lerPaginaDaLoja("loja-a"), PAGINA);
  assert.equal(vistos[0].url.pathname, "/rest/v1/bio_pages");
  assert.deepEqual(params(vistos[0].url), { select: SELECT, tenant_id: "eq.loja-a" });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await store.lerPaginaDaLoja("loja-a"), null);
});

test("cria como rascunho, com a loja, o slug e o documento", async () => {
  responder = () => ({ status: 201, corpo: [{ ...LINHA, publicada: false, versao: 1 }] });
  const criada = await store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC);
  assert.equal(criada.publicada, false);
  assert.equal(criada.versao, 1);
  assert.deepEqual([vistos[0].metodo, vistos[0].url.pathname], ["POST", "/rest/v1/bio_pages"]);
  assert.deepEqual(vistos[0].corpo, { tenant_id: "loja-a", slug: "loja-exemplo", publicada: false, documento: DOC });
  assert.match(vistos[0].prefer, /return=representation/);
});

test("criar de novo (23505 em bio_pages_tenant_id_key) devolve a página que já existe", async () => {
  responder = (p) => (p.metodo === "POST" ? { status: 409, corpo: ERRO.loja } : { status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), PAGINA);
  assert.equal(vistos.length, 2);
  assert.deepEqual(params(vistos[1].url), { select: SELECT, tenant_id: "eq.loja-a" });
});

test("slug tomado (bio_pages_slug_key ou bio_slugs) tenta de novo com sufixo", async () => {
  let posts = 0;
  responder = () => {
    posts += 1;
    if (posts === 1) return { status: 409, corpo: ERRO.slugAtual };
    if (posts === 2) return { status: 409, corpo: ERRO.slugAntigo };
    return { status: 201, corpo: [{ ...LINHA, slug: "loja-exemplo-k7m2" }] };
  };
  await store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC);
  const slugs = vistos.map((p) => (p.corpo as { slug: string }).slug);
  assert.equal(slugs[0], "loja-exemplo");
  assert.match(slugs[1], /^loja-exemplo-[a-z2-9]{4}$/);
  assert.match(slugs[2], /^loja-exemplo-[a-z2-9]{4}$/);
});

test("sufixo nunca passa de 40 nem deixa hífen duplo", async () => {
  responder = (p) => (vistos.length === 1 ? { status: 409, corpo: ERRO.slugAtual } : { status: 201, corpo: [{ ...LINHA, slug: (p.corpo as { slug: string }).slug }] });
  const longo = `${"a".repeat(34)}-bbbbb`; // 40, com hífen na posição 35
  const criada = await store.criarPaginaDaLoja("loja-a", longo, DOC);
  assert.ok(criada.slug.length <= 40, criada.slug);
  assert.match(criada.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("três slugs tomados seguidos: desiste com erro; 23505 de outra unique e 500 sobem", async () => {
  responder = () => ({ status: 409, corpo: ERRO.slugAntigo });
  await assert.rejects(store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), /Não foi possível reservar/);
  assert.equal(vistos.length, 3);

  responder = () => ({ status: 409, corpo: ERRO.outroUnique });
  await assert.rejects(store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), /outra_coisa_key/);

  responder = () => ({ status: 500, corpo: { code: "XX000", message: "caiu", details: null, hint: null } });
  await assert.rejects(store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), /caiu/);
});

test("salvar: update só da loja e só na versão lida, gravando versão + 1 e updated_at", async () => {
  responder = () => ({ status: 200, corpo: [{ ...LINHA, versao: 4, slug: "nova" }] });
  const r = await store.salvarPaginaDaLoja("loja-a", { versao: 3, slug: "nova", publicada: true, documento: DOC });
  assert.ok(r.ok && r.pagina.versao === 4 && r.pagina.slug === "nova");
  assert.equal(vistos[0].metodo, "PATCH");
  assert.deepEqual(params(vistos[0].url), { select: SELECT, tenant_id: "eq.loja-a", versao: "eq.3" });
  const corpo = vistos[0].corpo as Record<string, unknown>;
  assert.deepEqual({ ...corpo, updated_at: "x" }, { slug: "nova", publicada: true, documento: DOC, versao: 4, updated_at: "x" });
  assert.ok(!Number.isNaN(Date.parse(String(corpo.updated_at))));
});

test("salvar sem linha atualizada: relê pela loja — existe é 'versao', não existe é 'sem-pagina'", async () => {
  responder = (p) => (p.metodo === "PATCH" ? { status: 200, corpo: [] } : { status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.salvarPaginaDaLoja("loja-a", { versao: 2, slug: "x-y", publicada: true, documento: DOC }), { ok: false, motivo: "versao" });
  assert.deepEqual(params(vistos[1].url), { select: SELECT, tenant_id: "eq.loja-a" });

  responder = () => ({ status: 200, corpo: [] });
  assert.deepEqual(await store.salvarPaginaDaLoja("loja-b", { versao: 1, slug: "x-y", publicada: false, documento: DOC }), { ok: false, motivo: "sem-pagina" });
});

test("salvar com slug de outra página (atual ou antigo) é 'slug'; outro 23505 sobe", async () => {
  for (const erro of [ERRO.slugAtual, ERRO.slugAntigo]) {
    responder = () => ({ status: 409, corpo: erro });
    assert.deepEqual(await store.salvarPaginaDaLoja("loja-a", { versao: 3, slug: "loja-exemplo", publicada: true, documento: DOC }), { ok: false, motivo: "slug" });
  }
  responder = () => ({ status: 409, corpo: ERRO.outroUnique });
  await assert.rejects(store.salvarPaginaDaLoja("loja-a", { versao: 3, slug: "x-y", publicada: true, documento: DOC }), /outra_coisa_key/);
});

test("slug disponível: nunca usado, já desta loja, de outra loja, de página apagada", async () => {
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await store.slugDisponivel("novo-slug", "loja-a"), true);
  assert.equal(vistos[0].url.pathname, "/rest/v1/bio_slugs");
  assert.deepEqual(params(vistos[0].url), { select: "pagina_id", slug: "eq.novo-slug" });

  vistos.length = 0;
  responder = (p) => (p.url.pathname === "/rest/v1/bio_slugs" ? { status: 200, corpo: [{ pagina_id: "aaaaaaaa-0000-4000-8000-000000000001" }] } : { status: 200, corpo: [{ id: "aaaaaaaa-0000-4000-8000-000000000001" }] });
  assert.equal(await store.slugDisponivel("loja-exemplo", "loja-a"), true);
  assert.deepEqual(params(vistos[1].url), { select: "id", tenant_id: "eq.loja-a", id: "eq.aaaaaaaa-0000-4000-8000-000000000001" });

  responder = (p) => (p.url.pathname === "/rest/v1/bio_slugs" ? { status: 200, corpo: [{ pagina_id: "pagina-de-outra" }] } : { status: 200, corpo: [] });
  assert.equal(await store.slugDisponivel("loja-exemplo", "loja-a"), false);

  responder = () => ({ status: 200, corpo: [{ pagina_id: null }] });
  assert.equal(await store.slugDisponivel("loja-apagada", "loja-a"), false);
});

test("leitura pública pelo slug (atual ou antigo) passa por bio_slugs e só devolve publicada sem bloqueio", async () => {
  responder = (p) => (p.url.pathname === "/rest/v1/bio_slugs" ? { status: 200, corpo: [{ pagina_id: "aaaaaaaa-0000-4000-8000-000000000001" }] } : { status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.lerPublicadaPorSlug("slug-antigo"), PAGINA);
  assert.deepEqual(params(vistos[0].url), { select: "pagina_id", slug: "eq.slug-antigo" });
  assert.deepEqual(params(vistos[1].url), { select: SELECT, id: "eq.aaaaaaaa-0000-4000-8000-000000000001", publicada: "eq.true", bloqueada_em: "is.null" });

  vistos.length = 0;
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await store.lerPublicadaPorSlug("nao-existe"), null);
  assert.equal(vistos.length, 1, "slug desconhecido não vai a bio_pages");

  responder = () => ({ status: 200, corpo: [{ pagina_id: null }] });
  assert.equal(await store.lerPublicadaPorSlug("de-pagina-apagada"), null);
});

test("leitura pública por id e da loja: publicada = true e bloqueada_em nulo", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  await store.lerPublicadaPorId("aaaaaaaa-0000-4000-8000-000000000001");
  assert.deepEqual(params(vistos[0].url), { select: SELECT, id: "eq.aaaaaaaa-0000-4000-8000-000000000001", publicada: "eq.true", bloqueada_em: "is.null" });
  await store.lerPublicadaDaLoja("loja-a");
  assert.deepEqual(params(vistos[1].url), { select: SELECT, tenant_id: "eq.loja-a", publicada: "eq.true", bloqueada_em: "is.null" });
});

test("contar chama bio_contar com a página e o alvo; alvo fora do formato nem chama", async () => {
  responder = () => ({ status: 204 });
  await store.contarBio("aaaaaaaa-0000-4000-8000-000000000001", "visita");
  await store.contarBio("aaaaaaaa-0000-4000-8000-000000000001", "11111111-2222-4333-8444-aaaaaaaaaaaa");
  assert.deepEqual(
    vistos.map((p) => [p.metodo, p.url.pathname, p.corpo]),
    [
      ["POST", "/rest/v1/rpc/bio_contar", { p_pagina: "aaaaaaaa-0000-4000-8000-000000000001", p_alvo: "visita" }],
      ["POST", "/rest/v1/rpc/bio_contar", { p_pagina: "aaaaaaaa-0000-4000-8000-000000000001", p_alvo: "11111111-2222-4333-8444-aaaaaaaaaaaa" }],
    ],
  );
  vistos.length = 0;
  await assert.rejects(store.contarBio("aaaaaaaa-0000-4000-8000-000000000001", "11111111-2222-4333-8444-AAAAAAAAAAAA"), /Alvo de contagem inválido/);
  await assert.rejects(store.contarBio("aaaaaaaa-0000-4000-8000-000000000001", "visitas"), /Alvo de contagem inválido/);
  assert.equal(vistos.length, 0);
});

test("relatório chama bio_relatorio com a loja e as datas e devolve o JSON do banco", async () => {
  const relatorio = { visitas: 10, toques: 4, porLink: [{ linkId: "l1", toques: 4 }], porDia: [{ dia: "2026-10-19", visitas: 10, toques: 4 }] };
  responder = () => ({ status: 200, corpo: relatorio });
  assert.deepEqual(await store.relatorioBio("loja-a", "2026-10-13", "2026-10-19"), relatorio);
  assert.deepEqual([vistos[0].url.pathname, vistos[0].corpo], ["/rest/v1/rpc/bio_relatorio", { p_tenant: "loja-a", p_desde: "2026-10-13", p_ate: "2026-10-19" }]);
});

test("id público fora do formato: nem consulta (sem 22P02 virando 500)", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.equal(await store.lerPublicadaPorId("pagina-1"), null);
  assert.equal(await store.lerPublicadaPorId("AAAAAAAA-0000-4000-8000-000000000001"), null);
  await assert.rejects(store.contarBio("pagina-1", "visita"), /inválid/);
  assert.equal(vistos.length, 0);
});

test("relatório com datas fora do formato, inexistentes, invertidas ou com mais de 366 dias nem chama", async () => {
  responder = () => ({ status: 200, corpo: { visitas: 0, toques: 0, porLink: [], porDia: [] } });
  for (const [desde, ate] of [
    ["2026-10-13", "19/10/2026"],
    ["2026-10-13T00:00", "2026-10-19"],
    ["2026-02-30", "2026-03-01"],
    ["2026-13-01", "2026-12-31"],
    ["2026-10-19", "2026-10-13"],
    ["2025-10-18", "2026-10-20"],
  ]) {
    await assert.rejects(store.relatorioBio("loja-a", desde, ate), /inválid|Período/, `${desde} → ${ate}`);
  }
  assert.equal(vistos.length, 0);

  await store.relatorioBio("loja-a", "2025-10-19", "2026-10-20"); // 366 dias: passa
  await store.relatorioBio("loja-a", "2026-10-19", "2026-10-19");
  assert.equal(vistos.length, 2);
});
