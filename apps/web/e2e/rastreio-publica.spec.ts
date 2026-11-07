// apps/web/e2e/rastreio-publica.spec.ts
import { createHmac, randomInt } from "node:crypto";

import { expect, test, type APIResponse } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Rastreio de pedidos, página pública (PR 3), sem sessão, contra o banco de dev.
 *
 * Loja FIXA (criada no primeiro run, regravada nos outros), como a da bio; nunca a loja de QA. Os PEDIDOS são por
 * run: external_id, CPF e celular saem de números sorteados, então a busca só enxerga os do próprio run e dois runs
 * no mesmo banco não se pisam (o "parar" de um não apaga o de outro). O afterAll apaga os pedidos do run
 * (os avisos vão junto, on delete cascade). Dado todo inventado.
 * O que este arquivo NÃO prova: CSP duplicada — só a Vercel mostra; a prova é o `curl -sI` depois do deploy.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PEPPER = (process.env.RASTREIO_DOC_PEPPER ?? "").trim();
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
/** Allowlist, não denylist: só o banco de dev. */
const NO_BANCO_DE_DEV = URL_SUPABASE.includes("wfjuwogxaupyadwhvoxy");
/** Mesmo mínimo de `pepperDoRastreio`: abaixo disso o servidor nem busca. */
const PEPPER_OK = PEPPER.length >= 32;

const LOJA_SLUG = "e2e-rastreio-fixa";
const NOME = "Loja Exemplo E2E";
const PUBLIC_SLUG = "e2e-rastreio";
/** TLD `.test`: nunca é host de verdade. */
const DOMINIO = "pedidos.e2e-rastreio.test";
const SEM_DONO = "sem-dono.e2e-rastreio.test";

// CPF inventado por run, com o dígito calculado aqui (repo público; `documento.ts` é server-only).
const dv = (s: string, pesos: number[]) => {
  const r = [...s].reduce((t, c, i) => t + Number(c) * pesos[i], 0) % 11;
  return String(r < 2 ? 0 : 11 - r);
};
const pesos = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
const cpfCom = (b: string) => {
  const d = dv(b, pesos(9));
  return b + d + dv(b + d, pesos(10));
};
function baseAleatoria(): string {
  for (;;) {
    const b = String(randomInt(0, 1_000_000_000)).padStart(9, "0");
    if (new Set(b).size > 1) return b; // CPF de dígitos repetidos é recusado
  }
}

const RUN = `${Date.now().toString(36)}${randomInt(0, 1_000_000).toString(36)}`;
const CPF = cpfCom(baseAleatoria());
const CPF_DIGITADO = `${CPF.slice(0, 3)}.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-${CPF.slice(9)}`;
const FINAL = String(randomInt(0, 10_000)).padStart(4, "0");
const CELULAR = `551198765${FINAL}`;

test.use({ storageState: { cookies: [], origins: [] } });

function csps(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "content-security-policy")
    .map((h) => h.value);
}

test.describe("rastreio: página pública", () => {
  test.skip(
    !TEM_BANCO || !NO_BANCO_DE_DEV || !PEPPER_OK,
    "Precisa da service role do banco de DEV e de RASTREIO_DOC_PEPPER (32+ caracteres).",
  );

  let banco: SupabaseClient;
  let lojaId = "";
  const pedidos: { id: string; token: string }[] = [];
  const externos = [`e2e-rastreio-${RUN}-1001`, `e2e-rastreio-${RUN}-1002`];

  async function ok(r: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
    const { error } = await r;
    if (error) throw new Error(error.message);
  }
  async function idDaLoja(): Promise<string> {
    const { data, error } = await banco.from("organizations").select("id").eq("slug", LOJA_SLUG).maybeSingle();
    if (error) throw new Error(`organizations: ${error.message}`);
    return (data as { id: string } | null)?.id ?? "";
  }
  async function pedidoNoBanco(id: string): Promise<{ notices_stopped_at: string | null }> {
    const { data, error } = await banco
      .from("tracking_orders")
      .select("notices_stopped_at")
      .eq("tenant_id", lojaId)
      .eq("id", id)
      .single();
    if (error) throw new Error(`pedido: ${error.message}`);
    return data as { notices_stopped_at: string | null };
  }
  async function totalOptouts(): Promise<number> {
    const { count, error } = await banco
      .from("optouts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", lojaId);
    if (error) throw new Error(`optouts: ${error.message}`);
    return count ?? 0;
  }

  test.beforeAll(async () => {
    banco = createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    lojaId = await idDaLoja();
    if (!lojaId) {
      const { error } = await banco.from("organizations").insert({ name: NOME, slug: LOJA_SLUG });
      if (error && error.code !== "23505") throw new Error(`loja do e2e: ${error.message}`);
      lojaId = await idDaLoja();
      if (!lojaId) throw new Error("loja do e2e não existe depois do insert");
    }
    await ok(banco.from("tenant_settings").upsert({ tenant_id: lojaId, rastreio_enabled: true }, { onConflict: "tenant_id" }));
    await ok(
      banco.from("tracking_settings").upsert(
        {
          tenant_id: lojaId,
          public_slug: PUBLIC_SLUG,
          store_whatsapp: null,
          vip_link_id: null,
          imported_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      ),
    );
    await ok(
      banco
        .from("custom_domains")
        .upsert(
          { tenant_id: lojaId, hostname: DOMINIO, verification_token: "e2e-rastreio", status: "active" },
          { onConflict: "tenant_id" },
        ),
    );

    const comuns = {
      buyer_first_name: "Ana",
      buyer_phone: CELULAR,
      buyer_email_enc: null,
      doc_hmac: createHmac("sha256", PEPPER).update(CPF).digest("hex"),
      historico: [],
    };
    const base = [
      {
        external_id: externos[0],
        numero: "1001",
        status_raw: "on_carriage",
        etapa: "enviado",
        tracking_code: "AB123456789BR",
        tracking_url: "https://rastreio.e2e-rastreio.test/AB123456789BR",
        shipment_service: "Correios · SEDEX",
      },
      {
        external_id: externos[1],
        numero: "1002",
        status_raw: "delivered",
        etapa: "entregue",
        tracking_code: "AC987654321BR",
        tracking_url: null,
        shipment_service: "Correios · PAC",
      },
    ];
    for (const [i, p] of base.entries()) {
      const criado = new Date(Date.now() - (2 - i) * 86_400_000).toISOString(); // dentro dos 90 dias a cada run
      const { data, error } = await banco.rpc("rastreio_gravar_pedido", {
        p_tenant: lojaId,
        p_pedido: { ...p, ...comuns, order_created_at: criado },
      });
      if (error) throw new Error(`pedido ${p.numero}: ${error.message}`);
      const linha = data as { id: string; link_token: string };
      pedidos[i] = { id: linha.id, token: linha.link_token };
      await ok(
        banco
          .from("tracking_orders")
          .update({ order_created_at: criado, notices_stopped_at: null })
          .eq("tenant_id", lojaId)
          .eq("id", linha.id),
      );
    }
    await ok(
      banco
        .from("tracking_notices")
        .upsert(
          { tenant_id: lojaId, order_id: pedidos[0].id, etapa: "enviado", channel: "email", status: "pendente" },
          { onConflict: "order_id,etapa,channel" },
        ),
    );
  });

  test.afterAll(async () => {
    if (!banco || !lojaId) return;
    // Só os pedidos deste run; os avisos saem junto (on delete cascade). A loja e o domínio ficam.
    await banco.from("tracking_orders").delete().eq("tenant_id", lojaId).in("external_id", externos);
  });

  test("busca no www: uma CSP com nonce, noindex, no-store e o título da loja", async ({ request }) => {
    const res = await request.get(`/rastreio/${PUBLIC_SLUG}`);
    expect(res.status()).toBe(200);
    const lista = csps(res);
    expect(lista, "um header CSP só").toHaveLength(1);
    expect(lista[0]).toContain("default-src 'none'");
    expect(lista[0]).toContain("form-action 'self'");
    const nonce = lista[0].match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1] ?? "";
    expect(nonce, "CSP sem nonce").not.toBe("");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
    expect(res.headers()["cache-control"]).toContain("no-store");
    const html = await res.text();
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain(`<title>Acompanhe seu pedido · ${NOME}</title>`);
  });

  test("busca → lista → pedido (só aquele) → parar avisos, no navegador", async ({ page }) => {
    const optoutsAntes = await totalOptouts();
    await page.goto(`/rastreio/${PUBLIC_SLUG}`);
    await page.getByLabel("CPF ou CNPJ").fill(CPF_DIGITADO);
    await page.getByLabel("Últimos 4 números do celular").fill(FINAL);
    await page.getByRole("button", { name: "Ver meus pedidos" }).click();

    await expect(page.getByRole("link", { name: /Pedido nº 1002/ })).toBeVisible();
    await page.getByRole("link", { name: /Pedido nº 1001/ }).click();
    await expect(page).toHaveURL(new RegExp(`/rastreio/${PUBLIC_SLUG}/${pedidos[0].token}$`));
    await expect(page.getByRole("heading", { name: "Pedido nº 1001" })).toBeVisible();
    await expect(page.getByText("Pedido nº 1002")).toHaveCount(0);
    // O botão nasce `hidden` e o script com nonce o mostra: prova que a CSP deixou o script rodar.
    await expect(page.getByRole("button", { name: "Copiar" })).toBeVisible();

    await page.getByRole("button", { name: "Não quero mais avisos deste pedido" }).click();
    await expect(page.getByText("Você não recebe mais avisos deste pedido.")).toBeVisible();

    expect((await pedidoNoBanco(pedidos[0].id)).notices_stopped_at).not.toBeNull();
    const { data, error } = await banco
      .from("tracking_notices")
      .select("status")
      .eq("order_id", pedidos[0].id)
      .eq("etapa", "enviado")
      .eq("channel", "email")
      .single();
    if (error) throw new Error(`aviso: ${error.message}`);
    expect((data as { status: string }).status).toBe("pulado");
    expect(await totalOptouts()).toBe(optoutsAntes);
  });

  test("GET no parar é 405 e não grava", async ({ request }) => {
    const res = await request.get(`/rastreio/${PUBLIC_SLUG}/${pedidos[1].token}/parar`);
    expect(res.status()).toBe(405);
    expect((await pedidoNoBanco(pedidos[1].id)).notices_stopped_at).toBeNull();
  });

  test("domínio do lojista: /rastreio e /rastreio/<token> da loja dona; host sem dono é o 404 de texto", async ({
    request,
  }) => {
    const busca = await request.get("/rastreio", { headers: { host: DOMINIO } });
    expect(busca.status()).toBe(200);
    expect(await busca.text()).toContain('action="/rastreio"');

    const pedido = await request.get(`/rastreio/${pedidos[0].token}`, { headers: { host: DOMINIO } });
    expect(pedido.status()).toBe(200);
    const html = await pedido.text();
    expect(html).toContain("Pedido nº 1001");
    expect(html).toContain(`action="/rastreio/${pedidos[0].token}/parar"`);

    const semDono = await request.get("/rastreio", { headers: { host: SEM_DONO } });
    expect(semDono.status()).toBe(404);
    expect(await semDono.text()).toBe("Link não encontrado.");
  });

  test("_dominio no host do Girumo é 404", async ({ request }) => {
    const res = await request.get("/rastreio/_dominio");
    expect(res.status()).toBe(404);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("app. e o apex mandam /rastreio para o www com 308", async ({ request }) => {
    for (const host of ["app.girumo.com.br", "girumo.com.br"]) {
      const res = await request.get(`/rastreio/${PUBLIC_SLUG}`, { headers: { host }, maxRedirects: 0 });
      expect(res.status(), host).toBe(308);
      expect(res.headers()["location"], host).toBe(`https://www.girumo.com.br/rastreio/${PUBLIC_SLUG}`);
    }
  });

  test("robots.txt tira /rastreio/ do índice", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(await res.text()).toContain("Disallow: /rastreio/");
  });
});
