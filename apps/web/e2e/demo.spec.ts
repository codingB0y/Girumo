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

  // Precisa ser o texto de validação ("Informe um celular...", ver
  // request-validation.ts), não só "o elemento apareceu": se
  // classifyRequest esquecer POST /api/demo/request, a rota devolve 401
  // "Nao autenticado." — que demo-cta.tsx renderiza nesse MESMO testid — e
  // o teste continuaria verde escondendo uma regressão de segurança real.
  await expect(page.getByTestId("demo-cta-error")).toContainText(/celular/i);
});

test("'Prefiro falar agora' revela o CTA num passo intermediário, sem avançar", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByTestId("demo-cta")).toHaveCount(0);
  await page.getByTestId("demo-cta-early").click();

  // Continua no passo 1: o link não avança o índice, só revela o formulário.
  await expect(page.getByTestId("demo-progress")).toHaveText("Passo 1 de 4");
  await expect(page.getByTestId("demo-step-campaign")).toBeVisible();
  await expect(page.getByTestId("demo-cta")).toBeVisible();
  await expect(page.getByTestId("demo-advance")).toBeVisible();
});
