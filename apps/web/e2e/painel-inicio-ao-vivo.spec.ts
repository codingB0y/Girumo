import { expect, test } from "@playwright/test";

/**
 * Início "Ao vivo" (spec 2026-10-02) atrás de ?ao-vivo. O tenant de QA não tem
 * número: a tela abre com o banner de desconectado e os números da loja.
 */

test.describe("Início ao vivo", () => {
  test("abre com a faixa da loja e o número desconectado", async ({ page }) => {
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible();
    const faixa = page.getByTestId("inicio-faixa");
    // O chip é "● AO VIVO" (com o ponto): casar por regex, não por texto exato.
    await expect(faixa.getByText(/AO VIVO/)).toBeVisible();
    await expect(faixa.getByText("Entraram hoje")).toBeVisible();
    await expect(faixa.getByText("Pedidos anotados hoje")).toBeVisible();
    await expect(page.getByText("Seu WhatsApp está desconectado")).toBeVisible();
    // O mapa aparece com ou sem grupos no tenant de QA: o título é o mesmo nos dois estados.
    await expect(page.getByTestId("inicio-mapa").getByRole("heading", { name: "Mapa dos grupos" })).toBeVisible();
    await expect(page.getByTestId("inicio-entradas").getByRole("heading", { name: "Entradas e saídas" })).toBeVisible();
    await expect(page.getByTestId("inicio-postando").getByRole("heading", { name: "Postando agora" })).toBeVisible();
    // O tenant de QA não tem oferta aberta: a coluna aparece no estado quieto.
    await expect(page.getByTestId("inicio-relampago").getByRole("heading", { name: "Relâmpago" })).toBeVisible();
  });

  test("nenhum botão ou link em Acid (regra 10)", async ({ page }) => {
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[class*="bg-acid"], a[class*="bg-acid"]')).toHaveCount(0);
  });

  test("a partir de 1400 px a Relâmpago fica na terceira coluna, mesmo quieta", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const relampago = await page.getByTestId("inicio-relampago").boundingBox();
    const mapa = await page.getByTestId("inicio-mapa").boundingBox();
    expect(relampago).not.toBeNull();
    expect(mapa).not.toBeNull();
    expect(relampago!.x).toBeGreaterThan(mapa!.x + mapa!.width - 1);
  });

  test("no celular não há rolagem para o lado", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-relampago")).toBeVisible({ timeout: 30_000 });
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test("sem o parâmetro, continua a Vitrine", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-ao-vivo")).toHaveCount(0);
    await expect(page.getByTestId("inicio-caixa")).toBeVisible();
  });
});
