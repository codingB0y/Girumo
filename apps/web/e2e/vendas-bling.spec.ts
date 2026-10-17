import { randomInt } from "node:crypto";

import { expect, request as novoRequest, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { formatPhoneBR } from "../src/lib/phone";
import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * Venda do Bling em Vendas (spec 2026-10-13-integracao-bling §1 e §6): a venda que
 * o motor da integração grava em `orders` (`source = 'bling'`, sem autora, sem
 * itens) aparece para o dono com o selo "Bling" e "Altere no Bling" no lugar de
 * "Corrigir", e as rotas recusam apagá-la com 409 — o Bling é a fonte da verdade.
 *
 * O pedido é criado pela service-role como o motor cria, na loja de QA, e sai no
 * afterAll. Resto de execução que morreu no meio é varrido no começo da próxima
 * (pela marca em `group_name`, com mais de uma hora: não pega um run vivo em
 * paralelo). Precisa da DDL do Bling no banco de dev (`orders.source`).
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);

const MARCA = "e2e-vendas-bling";
const UMA_HORA_MS = 3_600_000;
const VENDA_DO_BLING = { error: "Venda do Bling: altere no Bling." };

/** A loja em que o usuário de QA (dono) cai ao logar. */
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

test.describe("venda do Bling em Vendas", () => {
  test.skip(
    !TEM_CREDENCIAIS || !TEM_BANCO,
    "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD) e da service role de dev (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
  );

  let banco: SupabaseClient;
  let pedido: { id: string; telefone: string } | undefined;

  test.beforeAll(async () => {
    banco = createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
    const tenantId = await lojaDeQa();
    const { error: erroVarredura } = await banco
      .from("orders")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("source", "bling")
      .eq("group_name", MARCA)
      .lt("created_at", new Date(Date.now() - UMA_HORA_MS).toISOString());
    if (erroVarredura) throw new Error(`varredura das vendas do Bling de teste: ${erroVarredura.message}`);

    // DDI + DDD 11 + 9 + oito dígitos sorteados: número que nenhuma venda da loja de QA tem.
    const telefone = `55119${String(randomInt(100_000_000)).padStart(8, "0")}`;
    const { data, error } = await banco
      .from("orders")
      .insert({
        tenant_id: tenantId,
        phone: telefone,
        value: 1000 + randomInt(100_000) / 100,
        source: "bling",
        group_name: MARCA,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`venda do Bling de teste: ${error?.message ?? "sem linha"}`);
    pedido = { id: (data as { id: string }).id, telefone };
  });

  test.afterAll(async () => {
    if (!pedido) return;
    const { error } = await banco.from("orders").delete().eq("id", pedido.id).eq("source", "bling");
    if (error) throw new Error(`apagar a venda do Bling de teste: ${error.message}`);
  });

  test("aparece para o dono com o selo e sem Corrigir, e as rotas recusam apagar com 409", async ({ page }) => {
    if (!pedido) throw new Error("o beforeAll não criou a venda do Bling");
    const { id, telefone } = pedido;

    await page.goto("/painel/vendas");
    const minhas = page.getByRole("region", { name: /^Minhas vendas/ });
    // Sem lead, a linha mostra o número formatado (`nomeDoCliente`).
    const linha = minhas.getByRole("listitem").filter({ hasText: formatPhoneBR(telefone) ?? telefone });
    await expect(linha).toBeVisible({ timeout: 30_000 });
    await expect(linha.getByText("Bling", { exact: true })).toBeVisible();
    await expect(linha).toContainText("Altere no Bling");
    await expect(linha.getByRole("button", { name: /Corrigir/ })).toHaveCount(0);
    await test.info().attach("vendas-bling", { body: await minhas.screenshot(), contentType: "image/png" });

    // A sessão do dono vale (a tela carregou): o 409 é a trava do Bling, não falta de login nem de papel.
    for (const caminho of [`/api/vendas/${id}`, `/api/orders?id=${id}`]) {
      const res = await page.request.delete(caminho);
      expect(res.status(), `DELETE ${caminho}`).toBe(409);
      expect(await res.json(), `DELETE ${caminho}`).toEqual(VENDA_DO_BLING);
    }
    const { data, error } = await banco.from("orders").select("id").eq("id", id);
    expect(error).toBeNull();
    expect(data, "a venda do Bling continua no banco").toHaveLength(1);
  });
});
