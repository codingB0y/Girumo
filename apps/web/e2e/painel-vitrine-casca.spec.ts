import { expect, test } from "@playwright/test";
import { ROTAS_DO_PAINEL } from "./rotas";

/**
 * Casca da Vitrine Aberta (spec 2026-09-07, 3.1 e 3.2). Só vale com a flag
 * A casca antiga saiu junto com a flag; esta é a única que existe.
 */

test.describe("casca mobile da Vitrine Aberta", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // Um teste por rota, como o painel-rotas: rota que redireciona no cliente
  // aborta o goto seguinte quando tudo roda numa pagina so.
  for (const rota of ROTAS_DO_PAINEL) {
    test(`${rota} tem o Postar e a barra`, async ({ page }) => {
      await page.goto(rota, { waitUntil: "load" });
      await expect(page.getByTestId("painel-root"), `${rota} nao montou o shell`).toBeVisible();
      await expect(page.getByTestId("painel-postar"), `${rota} sem o Postar`).toBeVisible();
      await expect(page.getByTestId("painel-barra"), `${rota} sem a barra`).toBeVisible();
    });
  }

  test("Inicio no mobile: faixa da loja e as abas das secoes", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Seções da tela ao vivo" })).toBeVisible();
  });

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

test.describe("casca desktop G2: barra volt em cima", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("barra com loja, módulos, número, Postar e avatar; Mais abre o painel; barra inferior fora", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-root")).toBeVisible();

    const barra = page.getByTestId("painel-barra");
    await expect(barra).toBeVisible();
    await expect(barra.getByTestId("painel-barra-loja")).toBeVisible({ timeout: 30_000 });
    const modulos = barra.getByRole("navigation", { name: "Módulos" });
    for (const nome of ["Início", "Campanhas", "Disparos", "Grupos", "Contatos"]) {
      await expect(modulos.getByRole("link", { name: nome, exact: true })).toBeVisible();
    }
    // Com oferta aberta o nome acessível vira "Relâmpago oferta no ar": casa pelo começo.
    await expect(modulos.getByRole("link", { name: /^Relâmpago/ })).toBeVisible();
    await expect(modulos.getByRole("link", { name: "Início", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(barra.getByRole("link", { name: /· seu número$/ })).toBeVisible();
    await expect(barra.getByTestId("painel-postar-barra")).toBeVisible();
    await expect(barra.getByRole("link", { name: /· Configurações da loja$/ })).toBeVisible();

    await modulos.getByRole("button", { name: "Mais" }).click();
    const menu = page.getByTestId("painel-menu-mais");
    await expect(menu).toBeVisible();
    for (const grupo of ["Vender", "Lotar", "Loja"]) {
      await expect(menu.getByRole("heading", { name: grupo })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: /^Campanhas · / })).toBeVisible({ timeout: 30_000 });
    await expect(menu.getByTestId("painel-romaneio")).not.toHaveText("…", { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(modulos.getByRole("button", { name: "Mais" })).toBeFocused();

    await expect(page.getByTestId("painel-mobile-nav")).toBeHidden();
  });

  test("Postar da barra abre a folha como diálogo e Esc fecha", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    await page.getByTestId("painel-postar-barra").click();
    const folha = page.getByTestId("painel-folha-postar");
    await expect(folha).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(folha).toHaveCount(0);
  });

  test("em Disparos a tela é o compositor: a barra não repete o Postar", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });
    await expect(page.getByTestId("painel-barra")).toBeVisible();
    await expect(page.getByTestId("painel-postar-barra")).toHaveCount(0);
  });

  test("Inicio ao vivo no desktop: faixa, mapa, postando e relampago no lugar", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible();
    await expect(page.getByTestId("inicio-mapa")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeVisible();
    await expect(page.getByTestId("inicio-relampago")).toBeVisible();
    // Sem fundo Acid alem do chip AO VIVO/LOTOU: nenhum botao Acid em classe Tailwind na tela.
    const acidButtons = await page.locator('button[class*="bg-acid"], a[class*="bg-acid"]').count();
    expect(acidButtons).toBe(0);
  });

  test("entre 1024 e 1280 a barra esconde o nome da loja e cabe sem rolagem", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const barra = page.getByTestId("painel-barra");
    await expect(barra).toBeVisible();
    await expect(barra.getByTestId("painel-barra-loja")).toBeHidden();
    await expect(barra.getByRole("link", { name: "Grupos", exact: true })).toHaveAttribute("aria-current", "page");
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura).toBeLessThanOrEqual(1024);
  });
});
