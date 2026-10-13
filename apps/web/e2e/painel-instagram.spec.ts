import { expect, test } from "@playwright/test";

import { exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * Editor de Fluxos do Instagram (fase 1): cria pela receita, troca de visao e
 * confere o checklist de publicacao.
 *
 * A loja de QA ainda nao tem `tenant_settings.instagram_enabled`; sem a
 * liberacao o menu e as rotas escondem a feature. Entao o teste se pula (e nao
 * fica vermelho) enquanto /api/ig/status disser `enabled: false`.
 */
test.describe("Fluxos do Instagram", () => {
  test.beforeEach(() => exigeCredenciais());

  test("cria um rascunho pela receita, troca de visao e ve o que falta pra publicar", async ({ page }) => {
    const status = await page.request.get("/api/ig/status");
    const liberado = status.ok() && ((await status.json()) as { enabled?: boolean }).enabled === true;
    test.skip(!liberado, "A loja de QA nao tem instagram_enabled; libere em tenant_settings para rodar.");

    let id: string | undefined;
    try {
      await page.goto("/painel/instagram/novo", { waitUntil: "domcontentloaded" });
      await page.getByRole("radio", { name: /Comentou, segue e entra no grupo/ }).click();
      await page.getByRole("button", { name: "Criar rascunho" }).click();
      await expect(page).toHaveURL(/\/painel\/instagram\/[0-9a-f-]{36}/);
      id = page.url().match(/instagram\/([0-9a-f-]{36})/)?.[1];

      await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();
      const praPublicar = page.getByRole("region", { name: "Pra publicar" });
      await expect(praPublicar).toBeVisible();
      // O mesmo texto tambem aparece no aviso do topo; escopo na lista evita strict mode.
      await expect(praPublicar.getByText("Conecte o Instagram pra publicar.")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Publicar/ })).toBeDisabled();

      const verComo = page.getByRole("group", { name: "Ver como" });
      await verComo.getByRole("button", { name: "Mapa" }).click();
      await expect(page.getByTestId("ig-mapa")).toBeVisible();
      await verComo.getByRole("button", { name: "Passo a passo" }).click();
      await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();
      await page.getByRole("tab", { name: "Atendimentos" }).click();
      await expect(page.getByRole("region", { name: "Atendimentos" })).toBeVisible();
      await expect(page.getByText(/Ninguém chamou ainda/)).toBeVisible();
      await page.getByRole("tab", { name: "Roteiro" }).click();
      await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();

      // O editor e modo foco: a casca some, a raiz fica.
      await expect(page.getByTestId("painel-root")).toBeVisible();
      await expect(page.getByTestId("painel-barra")).toHaveCount(0);
      await semErroDeRuntime(page);
    } finally {
      // Sem isto cada rerun deixaria um rascunho na loja de QA.
      if (id) await page.request.delete(`/api/ig/flows/${id}`);
    }
  });

  test("a página de assinar abre e mostra um estado da oferta", async ({ page }) => {
    await page.goto("/painel/instagram/assinar", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Assinar o Instagram" })).toBeVisible();
    // A loja de QA pode estar liberada (já assinado), sem plano ou com a oferta: qualquer um dos três vale.
    await expect(page.getByText(/já está assinado|Assine um plano primeiro|Total hoje/).first()).toBeVisible();
    await semErroDeRuntime(page);
  });

  test("a lista mostra o estado da conta e o botão de conectar ou desconectar", async ({ page }) => {
    const status = await page.request.get("/api/ig/status");
    const liberado = status.ok() && ((await status.json()) as { enabled?: boolean }).enabled === true;
    test.skip(!liberado, "A loja de QA nao tem instagram_enabled; libere em tenant_settings para rodar.");
    await page.goto("/painel/instagram", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^(Conectar Instagram|Desconectar)$/ })).toBeVisible();
    await semErroDeRuntime(page);
  });
});
