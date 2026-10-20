// apps/web/e2e/link-da-bio-publica.spec.ts
import { expect, test, type APIResponse } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { documentoPadrao } from "../src/lib/bio/documento";

/**
 * Link da bio, página pública (spec 2026-10-19-link-da-bio §2, §6 e §7), sem sessão, contra o banco de dev.
 *
 * Loja FIXA, como o usuário de QA: `bio_slugs` não aceita DELETE nem da service role (slug usado nunca volta para
 * outra loja), então loja e página por run deixariam slugs presos a cada run. O primeiro run cria; os outros só
 * regravam o estado que os testes esperam. O que este arquivo NÃO prova: CSP duplicada — o `next start` junta dois
 * headers iguais num só (Node `setHeader`); só a Vercel mostra, e a prova da spec é o `curl -sI` depois do deploy.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
/** Allowlist, não denylist: só o banco de dev (outro projeto qualquer também fica de fora). */
const NO_BANCO_DE_DEV = URL_SUPABASE.includes("wfjuwogxaupyadwhvoxy");

const LOJA_SLUG = "e2e-bio-fixa";
const NOME = "Loja E2E Bio";
const SLUG_ANTIGO = "e2e-bio-antigo";
const SLUG_ATUAL = "e2e-bio-atual";
/** Navegador de gente: conta visita. */
const GENTE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
/** Robô de prévia de link: nunca conta. Os testes que não medem visita usam ele. */
const ROBO = "facebookexternalhit/1.1";

test.use({ storageState: { cookies: [], origins: [] } });

function csps(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "content-security-policy")
    .map((h) => h.value);
}

/** Um header CSP só, o da superfície "bio", e o HTML usando o nonce dele. Devolve o HTML. */
async function conferirNonce(res: APIResponse): Promise<string> {
  const lista = csps(res);
  expect(lista, "um header CSP só").toHaveLength(1);
  expect(lista[0]).toContain("default-src 'none'");
  const nonce = lista[0].match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1] ?? "";
  expect(nonce, "CSP sem nonce").not.toBe("");
  const html = await res.text();
  expect(html).toContain(`nonce="${nonce}"`);
  return html;
}

test.describe("link da bio: página pública", () => {
  test.skip(!TEM_BANCO || !NO_BANCO_DE_DEV, "Precisa da service role do banco de DEV (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");

  let banco: SupabaseClient;
  let lojaId = "";
  let paginaId = "";

  async function idDe(tabela: "organizations" | "bio_pages", coluna: string, valor: string): Promise<string> {
    const { data, error } = await banco.from(tabela).select("id").eq(coluna, valor).maybeSingle();
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return (data as { id: string } | null)?.id ?? "";
  }

  async function visitas(): Promise<number> {
    const { data, error } = await banco
      .from("bio_contagens")
      .select("total")
      .eq("tenant_id", lojaId)
      .eq("pagina_id", paginaId)
      .eq("alvo", "visita");
    if (error) throw new Error(`leitura das visitas: ${error.message}`);
    return ((data ?? []) as { total: number }[]).reduce((soma, linha) => soma + linha.total, 0);
  }

  test.beforeAll(async () => {
    banco = createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
    const documento = documentoPadrao({ nome: NOME, campanhaId: null });

    // Primeiro run cria; 23505 = outro run criou no meio, então só lê de novo.
    lojaId = await idDe("organizations", "slug", LOJA_SLUG);
    if (!lojaId) {
      const { error } = await banco.from("organizations").insert({ name: NOME, slug: LOJA_SLUG });
      if (error && error.code !== "23505") throw new Error(`loja do e2e: ${error.message}`);
      lojaId = await idDe("organizations", "slug", LOJA_SLUG);
      if (!lojaId) throw new Error("loja do e2e não existe depois do insert");
    }
    paginaId = await idDe("bio_pages", "tenant_id", lojaId);
    if (!paginaId) {
      // Nasce no slug antigo; a troca logo abaixo deixa o antigo em bio_slugs, respondendo 301.
      const { error } = await banco
        .from("bio_pages")
        .insert({ tenant_id: lojaId, slug: SLUG_ANTIGO, publicada: true, documento });
      if (error && error.code !== "23505") throw new Error(`página do e2e: ${error.message}`);
      paginaId = await idDe("bio_pages", "tenant_id", lojaId);
      if (!paginaId) throw new Error("página do e2e não existe: slug preso em bio_slugs por outra loja?");
    }

    // O estado que os testes esperam, a cada run (o mesmo slug de novo passa no trigger: já é desta página).
    const { error } = await banco
      .from("bio_pages")
      .update({ slug: SLUG_ATUAL, publicada: true, bloqueada_em: null, documento })
      .eq("tenant_id", lojaId)
      .eq("id", paginaId);
    if (error) throw new Error(`estado da página do e2e: ${error.message}`);
  });

  test("página publicada: 200 com a CSP da bio, o nonce dela no HTML e noindex", async ({ request }) => {
    const res = await request.get(`/bio/${SLUG_ATUAL}`, { headers: { "user-agent": ROBO } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    const html = await conferirNonce(res);
    expect(html).toContain(`data-pagina="${paginaId}"`);
    expect(html).toContain(`<title>${NOME}`);
  });

  test("HEAD: mesmo status e headers, sem corpo", async ({ request }) => {
    const res = await request.head(`/bio/${SLUG_ATUAL}`, { headers: { "user-agent": ROBO } });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    expect(csps(res)).toHaveLength(1);
    expect((await res.body()).length).toBe(0);
  });

  test("slug antigo: 301 para o atual, sem guardar no navegador, com a query", async ({ request }) => {
    const res = await request.get(`/bio/${SLUG_ANTIGO}?utm_source=e2e`, { headers: { "user-agent": ROBO }, maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const destino = new URL(res.headers()["location"] ?? "", "http://base.invalid");
    expect(destino.pathname).toBe(`/bio/${SLUG_ATUAL}`);
    expect(destino.searchParams.get("utm_source")).toBe("e2e");
  });

  test("slug que não existe e /bio/_dominio no host do Girumo: 404 HTML, sem marca", async ({ request }) => {
    for (const caminho of ["/bio/e2e-bio-nao-existe", "/bio/_dominio"]) {
      const res = await request.get(caminho, { headers: { "user-agent": ROBO } });
      expect(res.status(), caminho).toBe(404);
      expect(res.headers()["x-robots-tag"], caminho).toBe("noindex");
      const html = await conferirNonce(res);
      expect(html, caminho).toContain("Página não encontrada");
      expect(html, caminho).not.toMatch(/girumo/i);
    }
  });

  test("app. e o apex mandam /bio para o www com 308, levando a query", async ({ request }) => {
    for (const host of ["app.girumo.com.br", "girumo.com.br"]) {
      const res = await request.get(`/bio/${SLUG_ATUAL}?utm_source=e2e`, {
        headers: { host, "user-agent": ROBO },
        maxRedirects: 0,
      });
      expect(res.status(), host).toBe(308);
      expect(res.headers()["location"], host).toBe(`https://www.girumo.com.br/bio/${SLUG_ATUAL}?utm_source=e2e`);
    }
  });

  test("visita: o GET de gente chega no contador, depois da resposta", async ({ request }) => {
    const antes = await visitas();
    expect((await request.get(`/bio/${SLUG_ATUAL}`, { headers: { "user-agent": GENTE } })).status()).toBe(200);
    // "Pelo menos": outro run em paralelo usa a mesma página. HEAD, prefetch e robô: rota-publica.test.ts.
    await expect.poll(visitas, { timeout: 15_000 }).toBeGreaterThanOrEqual(antes + 1);
  });
});
