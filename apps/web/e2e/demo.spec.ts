import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("visitante anônimo percorre o demo e o rótulo nunca some", async ({ page }) => {
  await page.goto("/demo");

  // Não redirecionou para o login.
  await expect(page).toHaveURL(/\/demo$/);

  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId("demo-badge")).toBeVisible();
    await page.getByTestId("demo-advance").click();
  }

  await expect(page.getByTestId("demo-badge")).toBeVisible();
  await expect(page.getByTestId("demo-step-order")).toBeVisible();
  await expect(page.getByTestId("demo-advance")).toHaveCount(0);
  await expect(page.getByTestId("demo-cta")).toBeVisible();
});

test("o formulário recusa telefone que não é celular", async ({ page }) => {
  await page.goto("/demo");
  for (let i = 0; i < 3; i++) await page.getByTestId("demo-advance").click();

  await page.getByTestId("demo-cta-name").fill("Teste E2E");
  await page.getByTestId("demo-cta-phone").fill("(62) 3212-1314");
  await page.getByTestId("demo-cta-submit").click();

  await expect(page.getByTestId("demo-cta-error")).toBeVisible();
});
