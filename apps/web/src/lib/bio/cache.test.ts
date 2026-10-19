import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { documentoPadrao } from "./documento";
import type * as Cache from "./cache";

/**
 * `unstable_cache` e `revalidateTag` só rodam dentro do runtime do Next; aqui se prova o que
 * é nosso: as tags (contrato do §6) e a montagem do `DadosRender`, com as queries reais contra
 * um PostgREST de mentira.
 */

const vistos: URL[] = [];
let linhaDaPagina: Record<string, unknown> | null = null;

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  vistos.push(url);
  let corpo: unknown = [];
  if (url.pathname === "/rest/v1/bio_pages") corpo = linhaDaPagina ? [linhaDaPagina] : [];
  if (url.pathname === "/rest/v1/campaign_groups") corpo = [{ id: CAMPANHA, tenant_id: LOJA, name: "VIP", slug: "vip-atacado", group_ids: [], metadata: {} }];
  if (url.pathname === "/rest/v1/tracked_links") corpo = [{ slug: "vip-atacado", campaign_group_id: CAMPANHA }];
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

let cache: typeof Cache;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  cache = await import("./cache");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  vistos.length = 0;
});

const LOJA = "11111111-1111-4111-8111-111111111111";
const CAMPANHA = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const DOC = documentoPadrao({ nome: "Loja Exemplo", campanhaId: CAMPANHA });
const LINHA = {
  id: "pagina-1",
  tenant_id: LOJA,
  slug: "loja-exemplo",
  publicada: true,
  bloqueada_em: null,
  documento: DOC,
  versao: 2,
  updated_at: "2026-10-19T12:00:00.000Z",
};

test("as tags são as do contrato (spec §6)", () => {
  assert.equal(cache.tagDoSlug("loja-exemplo"), "bio-slug:loja-exemplo");
  assert.equal(cache.tagDaLoja(LOJA), `bio-loja:${LOJA}`);
  assert.equal(cache.tagDaPagina("pagina-1"), "bio-pagina:pagina-1");
});

test("salvar invalida o slug novo e o antigo, a página e a loja — sem repetir", () => {
  assert.deepEqual(cache.tagsParaInvalidar({ tenantId: LOJA, paginaId: "pagina-1", slugs: ["nova", "velha", "nova", ""] }), [
    `bio-loja:${LOJA}`,
    "bio-pagina:pagina-1",
    "bio-slug:nova",
    "bio-slug:velha",
  ]);
});

test("monta o núcleo: documento, id da página e o estado dos links da loja", async () => {
  linhaDaPagina = LINHA;
  const n = await cache.montarNucleo({ id: "pagina-1", tenantId: LOJA, slug: "loja-exemplo" });
  assert.deepEqual(n, { documento: DOC, paginaId: "pagina-1", campanhas: { [CAMPANHA]: "vip-atacado" }, linksEscondidos: [] });
  assert.deepEqual(Object.fromEntries(vistos[0].searchParams), {
    select: "id,tenant_id,slug,publicada,bloqueada_em,documento,versao,updated_at",
    id: "eq.pagina-1",
    publicada: "eq.true",
    bloqueada_em: "is.null",
  });
  for (const url of vistos.slice(1)) assert.equal(url.searchParams.get("tenant_id"), `eq.${LOJA}`, url.pathname);
  assert.deepEqual(JSON.parse(JSON.stringify(n)), n, "o unstable_cache guarda JSON: nada de undefined nem Date");
});

test("página que saiu do ar, ou que não é mais da loja achada no passo 1: nada", async () => {
  linhaDaPagina = null;
  assert.equal(await cache.montarNucleo({ id: "pagina-1", tenantId: LOJA, slug: "loja-exemplo" }), null);

  vistos.length = 0;
  linhaDaPagina = { ...LINHA, tenant_id: "22222222-2222-4222-8222-222222222222" };
  assert.equal(await cache.montarNucleo({ id: "pagina-1", tenantId: LOJA, slug: "loja-exemplo" }), null);
  assert.equal(vistos.length, 1, "não lê campanha nem número de ninguém");
});
