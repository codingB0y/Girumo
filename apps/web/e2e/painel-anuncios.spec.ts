import { randomBytes, randomInt } from "node:crypto";

import { expect, request as novoRequest, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A cadeia da spec 2026-10-10-funil-anuncios §8, do banco à tela: um cadastro com
 * campanha gravado em `site_captures` do tenant de QA aparece na aba Anúncios.
 *
 * A âncora do smoke (`conteudo-esperado.ts`) aceita o funil OU a tela Vazio, então
 * sozinha não prova que o relatório chega à tela. Aqui o dado é plantado pelo
 * service role (molde: `vendas-vendedora.spec.ts`), com `event_id` e campanha de
 * sufixo sorteado, e sai no afterAll. O nome da campanha é conferido na resposta da
 * rota: a tabela por campanha só chega no PR 6, que passa a cobrar o nome na tela.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
/** Só o que este spec cria começa assim: a limpeza não toca em mais nada. */
const PREFIXO = "e2e-anuncios-";
const UMA_HORA_MS = 3_600_000;

type Resposta = {
  tem_cadastro: boolean;
  relatorio: { total: { cadastros: number }; linhas: Array<{ nivel: string; campanha: string | null; cadastros: number }> };
};

function bancoDeDev(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** A loja em que o usuário de QA cai ao logar: é o tenant que a aba vai ler. */
async function lojaDeQa(): Promise<string> {
  const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
  try {
    const res = await api.get("/api/auth/me");
    if (!res.ok()) throw new Error(`GET /api/auth/me do usuário de QA respondeu ${res.status()}`);
    const me = (await res.json()) as { tenantId?: string | null };
    if (!me.tenantId) throw new Error("o usuário de QA não tem loja");
    return me.tenantId;
  } finally {
    await api.dispose();
  }
}

test.describe("aba Anúncios: cadastro gravado no banco chega ao funil", () => {
  test.skip(
    !TEM_CREDENCIAIS || !TEM_BANCO,
    "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD) e da service role de dev (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
  );

  const sufixo = randomBytes(6).toString("hex");
  const eventId = `${PREFIXO}${sufixo}`;
  const campanha = `E2E Anúncios ${sufixo}`;
  let banco: SupabaseClient | undefined;
  let loja = "";

  test.beforeAll(async () => {
    banco = bancoDeDev();
    loja = await lojaDeQa();
    // Resto de execução que morreu antes do afterAll. Mais de uma hora: não pega um run vivo em paralelo.
    const { error: erroVelhos } = await banco
      .from("site_captures")
      .delete()
      .eq("tenant_id", loja)
      .like("event_id", `${PREFIXO}%`)
      .lt("created_at", new Date(Date.now() - UMA_HORA_MS).toISOString());
    if (erroVelhos) throw new Error(`limpeza de cadastros velhos: ${erroVelhos.message}`);

    const { error } = await banco.from("site_captures").insert({
      tenant_id: loja,
      whatsapp: `+55629${String(randomInt(10_000_000, 100_000_000))}`,
      event_id: eventId,
      utm_source: "ig",
      utm_campaign: campanha,
      page_url: `https://e2e.example/vip?utm_source=ig&utm_campaign=${encodeURIComponent(campanha)}`,
    });
    if (error) throw new Error(`insert em site_captures: ${error.message}`);
  });

  test.afterAll(async () => {
    if (!banco || !loja) return;
    const { error } = await banco.from("site_captures").delete().eq("tenant_id", loja).eq("event_id", eventId);
    if (error) throw new Error(`limpeza do cadastro ${eventId}: ${error.message}`);
  });

  test("o funil mostra pelo menos o cadastro plantado, e a resposta traz a campanha", async ({ page }) => {
    const chegou = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/resultados/anuncios" && r.request().method() === "GET",
    );
    await page.goto("/painel/resultados/anuncios", { waitUntil: "load" });

    const resposta = await chegou;
    expect(resposta.status()).toBe(200);
    const corpo = (await resposta.json()) as Resposta;
    expect(corpo.tem_cadastro).toBe(true);
    expect(corpo.relatorio.linhas).toContainEqual(
      expect.objectContaining({ nivel: "campanha", campanha, cadastros: 1 }),
    );

    // A tela: funil (não a tela Vazio) e o degrau de cima com pelo menos 1.
    await expect(page.getByRole("heading", { name: "Do anúncio à venda" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Ainda não chegou nenhum cadastro com origem" })).toHaveCount(0);
    const topo = page.getByRole("list", { name: "Funil do anúncio à venda" }).getByRole("listitem").first();
    const numero = (await topo.innerText()).match(/\d[\d.]*/)?.[0] ?? "0";
    expect(Number(numero.replace(/\./g, ""))).toBeGreaterThanOrEqual(1);
  });
});
