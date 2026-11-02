import { expect, test, type Page } from "@playwright/test";

import { moca, OFERTA_NORMAL } from "./recuperar-mocks";
import { exigeCredenciais } from "./sessao-helpers";

/**
 * O Recuperar na barra de cima e no Mais: a partir de 1280 px o item entra na barra com o contador;
 * abaixo disso (1024 a 1279) mora no Mais, que ganha um ponto. Status e oferta são simulados
 * (page.route): nada toca o banco nem o Stripe.
 */
test.beforeEach(() => exigeCredenciais());

const LIGADO = { enabled: true, precisaDeVoce: 12 };

/**
 * Em dev (NEXT_PUBLIC_APP_ENV=development, que é o que o CI sobe) o banner "Local Dev Mode"
 * fica fixo no topo com z-index 9999 e cobre a barra: o clique no Mais e no Postar bate nele.
 * Em produção o banner não existe. Fecha pelo botão dele antes de mexer na barra.
 */
async function fechaBannerDev(page: Page) {
  const fechar = page.getByRole("button", { name: "Fechar banner dev" });
  if (await fechar.isVisible()) await fechar.click();
}

for (const largura of [1024, 1280]) {
  test(`${largura} px: com o Recuperar ligado a barra não rola de lado`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await moca(page, { status: LIGADO, oferta: OFERTA_NORMAL });
    await page.goto("/painel/grupos", { waitUntil: "load" });
    // O <header> vem do servidor antes dos itens: mede só depois do estado final da barra
    // (NavDaBarra monta depois do /api/auth/me; o item do Recuperar, depois do status).
    const barra = page.getByTestId("painel-barra");
    if (largura >= 1280) await expect(barra.getByRole("link", { name: /^Recuperar/ })).toBeVisible();
    else await expect(barra.getByRole("button", { name: /precisam de você no Recuperar/ })).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura);
  });
}

test("1024 px: o item vai pro Mais, que ganha o ponto e a linha com a contagem", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await moca(page, { status: LIGADO, oferta: OFERTA_NORMAL });
  await page.goto("/painel/grupos", { waitUntil: "load" });
  await fechaBannerDev(page);
  const barra = page.getByTestId("painel-barra");
  // Por papel, um link com display:none nem aparece: o toBeHidden passaria sem link nenhum.
  const link = page.locator('[data-testid="painel-barra"] a[href="/painel/recuperar"]');
  await expect(link).toHaveCount(1);
  await expect(link).toBeHidden();
  const mais = barra.getByRole("button", { name: /^Mais.*12 precisam de você no Recuperar/ });
  await mais.click();
  await expect(page.getByTestId("painel-menu-mais").getByRole("link", { name: /Recuperar · 12 precisam de você/ })).toBeVisible();
});

test("1280 px: o item entra na barra com o contador e o Mais perde o ponto; na página dele só ele acende", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await moca(page, { status: LIGADO, oferta: OFERTA_NORMAL });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await fechaBannerDev(page);
  const barra = page.getByTestId("painel-barra");
  const item = barra.getByRole("link", { name: /^Recuperar\s*12\s*precisam de você$/ });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("aria-current", "page");
  await expect(barra.getByRole("button", { name: /^Mais/ })).not.toHaveClass(/pn-barra__item--ativo/);
  await expect(barra.getByRole("button", { name: /precisam de você no Recuperar/ })).toHaveCount(0);
});

test("desligado: fora da barra, no Mais, e abre a oferta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await moca(page, { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  await page.goto("/painel/grupos", { waitUntil: "load" });
  await fechaBannerDev(page);
  const barra = page.getByTestId("painel-barra");
  await expect(barra.getByRole("link", { name: /^Recuperar/ })).toHaveCount(0);
  await barra.getByRole("button", { name: "Mais" }).click();
  await page.getByTestId("painel-menu-mais").getByRole("link", { name: "Recuperar" }).click();
  await expect(page).toHaveURL(/\/painel\/recuperar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Recupere o carrinho e o Pix que ficaram pra trás" })).toBeVisible();
});
