import { expect, test } from "@playwright/test";

/**
 * Início "Ao vivo" (spec 2026-10-02): a tela padrão de /painel. O tenant de QA
 * não tem número: ela abre com o banner de desconectado e os números da loja.
 */

test.describe("Início ao vivo", () => {
  test("abre com a faixa da loja e o número desconectado", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
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
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[class*="bg-acid"], a[class*="bg-acid"]')).toHaveCount(0);
  });

  test("a partir de 1400 px a Relâmpago fica na terceira coluna, mesmo quieta", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const relampago = await page.getByTestId("inicio-relampago").boundingBox();
    const mapa = await page.getByTestId("inicio-mapa").boundingBox();
    expect(relampago).not.toBeNull();
    expect(mapa).not.toBeNull();
    expect(relampago!.x).toBeGreaterThan(mapa!.x + mapa!.width - 1);
  });

  test("no celular não há rolagem para o lado", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/painel", { waitUntil: "load" });
    // Qual aba abre primeiro depende da loja: não esperar um painel específico.
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    for (const nome of [/Relâmpago/, /Postando/, /Grupos/]) {
      await page.getByRole("tablist", { name: "Seções da tela ao vivo" }).getByRole("tab", { name: nome }).click();
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    }
  });

  test("o link antigo com ?ao-vivo abre a mesma tela", async ({ page }) => {
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible();
  });

  // Não salva: o tenant de QA é compartilhado, e a meta dele não é nossa.
  test("o editor da meta abre na faixa, Esc fecha e devolve o foco ao botão", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const celula = page.getByTestId("inicio-faixa");
    await expect(celula).toBeVisible({ timeout: 30_000 });
    const botao = celula.getByRole("button", { name: /^(definir|editar) meta$/ });
    await botao.click();
    const campo = celula.getByRole("textbox", { name: "Meta do mês em R$" });
    await expect(campo).toBeFocused();
    await expect(celula.getByRole("button", { name: "Salvar" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(campo).toHaveCount(0);
    await expect(botao).toBeFocused();
    // Cancelar fecha do mesmo jeito.
    await botao.click();
    await celula.getByRole("button", { name: "Cancelar" }).click();
    await expect(campo).toHaveCount(0);
    await expect(botao).toBeFocused();
  });
});

test.describe("Início ao vivo no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("as abas trocam a seção, a URL guarda a aba e a tela não rola para o lado", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const abas = page.getByRole("tablist", { name: "Seções da tela ao vivo" });
    await expect(abas).toBeVisible();
    await abas.getByRole("tab", { name: /Grupos/ }).click();
    await expect(page.getByTestId("inicio-mapa")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeHidden();
    await expect(page).toHaveURL(/\?aba=grupos$/);
    await abas.getByRole("tab", { name: /Postando/ }).click();
    await expect(page.getByTestId("inicio-postando")).toBeVisible();
    await expect(page.getByTestId("inicio-mapa")).toBeHidden();
    await abas.getByRole("tab", { name: /Relâmpago/ }).click();
    await expect(page.getByTestId("inicio-relampago")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeHidden();
    for (const nome of [/Relâmpago/, /Postando/, /Grupos/]) {
      await abas.getByRole("tab", { name: nome }).click();
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    }
  });

  test("a faixa rola de lado e nenhuma célula passa de 260 px", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible({ timeout: 30_000 });
    const larguras = await page
      .getByRole("group", { name: "Números de hoje" })
      .evaluate((el) => ({ celulas: [...el.children].map((c) => c.getBoundingClientRect().width), rola: el.scrollWidth > el.clientWidth }));
    expect(larguras.celulas).toHaveLength(5);
    expect(Math.max(...larguras.celulas)).toBeLessThanOrEqual(260);
    expect(larguras.rola).toBe(true);
  });

  test("o mapa é compacto no celular: célula baixa e o atalho para os grupos", async ({ page }) => {
    await page.goto("/painel?aba=grupos", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    test.skip((await celulas.count()) === 0, "o tenant de QA ficou sem grupos: não há célula para medir");
    const caixa = await celulas.first().boundingBox();
    expect(caixa?.height).toBeLessThanOrEqual(40);
    const ver = mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ });
    await expect(ver).toBeVisible();
    await expect(ver).toHaveAttribute("href", "/painel/grupos");
    expect((await ver.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("setas do teclado movem a seleção entre as abas", async ({ page }) => {
    await page.goto("/painel?aba=relampago", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const abas = page.getByRole("tablist", { name: "Seções da tela ao vivo" });
    await abas.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(abas.getByRole("tab", { name: /Postando/ })).toHaveAttribute("aria-selected", "true");
    await expect(abas.getByRole("tab", { name: /Postando/ })).toBeFocused();
    await page.keyboard.press("End");
    await expect(abas.getByRole("tab", { name: /Grupos/ })).toHaveAttribute("aria-selected", "true");
  });

  test("?aba= vale ao abrir; valor inválido cai na aba inicial", async ({ page }) => {
    await page.goto("/painel?aba=postando", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-postando")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("inicio-mapa")).toBeHidden();
    await page.goto("/painel?aba=x", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    // Cai na regra da aba inicial: exatamente uma aba selecionada, e é uma das três.
    await expect(page.getByRole("tablist", { name: "Seções da tela ao vivo" }).getByRole("tab", { selected: true })).toHaveCount(1);
  });
});

test.describe("Início ao vivo a partir de 768 px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sem abas: as três seções ficam visíveis ao mesmo tempo", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tablist", { name: "Seções da tela ao vivo" })).toBeHidden();
    await expect(page.getByTestId("inicio-mapa")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeVisible();
    await expect(page.getByTestId("inicio-relampago")).toBeVisible();
  });

  test("o mapa mantém as células de 56 px e não mostra os atalhos do celular", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    test.skip((await celulas.count()) === 0, "o tenant de QA ficou sem grupos: não há célula para medir");
    expect((await celulas.first().boundingBox())?.height).toBe(56);
    await expect(mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ })).toBeHidden();
  });
});
