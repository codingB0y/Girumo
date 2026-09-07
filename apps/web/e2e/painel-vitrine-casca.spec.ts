import { expect, test } from "@playwright/test";
import { ROTAS_DO_PAINEL } from "./rotas";

/**
 * Casca da Vitrine Aberta (spec 2026-09-07, 3.1 e 3.2). Só vale com a flag
 * ligada — desligada, a casca antiga está no ar e este arquivo pula inteiro.
 * Liga no CI no PR 10, quando a flag sai; até lá roda local com
 * NEXT_PUBLIC_PAINEL_VITRINE=on.
 */
const VITRINE = (process.env.NEXT_PUBLIC_PAINEL_VITRINE ?? "").trim().toLowerCase() === "on";

test.describe("casca mobile da Vitrine Aberta", () => {
  test.skip(!VITRINE, "NEXT_PUBLIC_PAINEL_VITRINE desligada: a casca antiga esta no ar");
  test.use({ viewport: { width: 390, height: 844 } });

  // Um teste por rota, como o painel-rotas: rota que redireciona no cliente
  // aborta o goto seguinte quando tudo roda numa pagina so.
  for (const rota of ROTAS_DO_PAINEL) {
    test(`${rota} tem o Postar e o letreiro`, async ({ page }) => {
      await page.goto(rota, { waitUntil: "load" });
      await expect(page.getByTestId("painel-root"), `${rota} nao montou o shell`).toBeVisible();
      await expect(page.getByTestId("painel-postar"), `${rota} sem o Postar`).toBeVisible();
      await expect(page.getByTestId("painel-letreiro"), `${rota} sem o letreiro`).toBeVisible();
    });
  }

  test("Postar abre a folha com campanha e previa na bolha", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await page.getByTestId("painel-postar").click();
    const folha = page.getByTestId("painel-folha-postar");
    await expect(folha).toBeVisible();
    // Em dev a primeira abertura compila tres rotas de API; producao responde em ms.
    await expect(folha.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });

    const seletor = folha.getByRole("combobox");
    if ((await seletor.count()) === 0) {
      await expect(folha.getByText(/Crie uma campanha primeiro/)).toBeVisible();
      return;
    }
    await expect(seletor).not.toHaveValue("");
    await folha.getByPlaceholder("Digite sua mensagem...").fill("Chegou peca nova, 3 por 99");
    await expect(folha.getByTestId("painel-bolha-previa")).toContainText("Chegou peca nova, 3 por 99");
    await page.keyboard.press("Escape");
    await expect(folha).toHaveCount(0);
  });

  test("Mais lista os modulos por grupo com o estado de cada um", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await page.getByRole("button", { name: "Mais" }).click();
    const folha = page.getByTestId("painel-folha-mais");
    await expect(folha).toBeVisible();
    for (const grupo of ["Vender", "Lotar", "Loja"]) {
      await expect(folha.getByRole("heading", { name: grupo })).toBeVisible();
    }
    // O estado chega depois de cinco rotas de API; em dev, a primeira vez compila todas.
    await expect(folha.getByRole("link", { name: /^Campanhas · / })).toBeVisible({ timeout: 30_000 });
    await expect(folha.getByRole("link", { name: /^Disparos · / })).toBeVisible();
    await expect(folha.getByRole("link", { name: "Configurações" })).toBeVisible();
  });
});

test.describe("casca desktop da Vitrine Aberta", () => {
  test.skip(!VITRINE, "NEXT_PUBLIC_PAINEL_VITRINE desligada: a casca antiga esta no ar");
  test.use({ viewport: { width: 1440, height: 900 } });

  test("corredor, letreiro e ticker no lugar; barra e casca antiga fora", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-root")).toBeVisible();

    const corredor = page.getByTestId("painel-corredor");
    await expect(corredor).toBeVisible();
    for (const grupo of ["Vender", "Lotar", "Loja"]) {
      await expect(corredor.getByRole("heading", { name: grupo })).toBeVisible();
    }
    await expect(corredor.getByRole("link", { name: /Seu número/ })).toBeVisible();
    await expect(corredor.getByRole("link", { name: "Configurações" })).toBeVisible();
    await expect(corredor.getByTestId("painel-romaneio")).not.toHaveText("…", { timeout: 30_000 });

    await expect(page.getByTestId("painel-letreiro")).toBeVisible();
    await expect(page.getByTestId("painel-ticker")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("painel-ticker")).not.toBeEmpty();

    await expect(page.getByTestId("painel-mobile-nav")).toBeHidden();
    await expect(page.getByTestId("painel-sidebar")).toHaveCount(0);
    await expect(page.getByTestId("painel-topbar")).toHaveCount(0);
  });

  test("abaixo de 1280 o corredor recolhe a 64px so com icones", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const corredor = page.getByTestId("painel-corredor");
    await expect(corredor).toBeVisible();
    // 64 exatos porque o box-sizing e border-box: a borda de 1px ja esta dentro da largura.
    const caixa = await corredor.boundingBox();
    expect(caixa?.width).toBe(64);
    // O rotulo some da tela; o cabecalho do grupo e o nome do link seguem na arvore de acessibilidade.
    await expect(corredor.getByText("Configurações", { exact: true })).toBeHidden();
    await expect(corredor.getByRole("heading", { name: "Vender" })).toHaveCount(1);
    await expect(corredor.getByRole("link", { name: "Grupos" })).toHaveAttribute("aria-current", "page");
  });
});
