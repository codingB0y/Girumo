import { expect, test } from "@playwright/test";

/**
 * Configurações na Vitrine Aberta. Só vale com a flag ligada — desligada, a
 * tela antiga está no ar e este arquivo pula inteiro.
 *
 * O que ele guarda são as duas coisas que os testes puros não alcançam: o
 * DESENHO das portas com o dado de cada uma, e o que a tela faz quando uma das
 * cinco consultas cai. Os cinco fetches desta tela têm `catch` silencioso, então
 * lista vazia e `live: false` chegavam iguais quer o dado fosse esse, quer a
 * rota tivesse morrido.
 */

test.describe("Configurações na Vitrine Aberta", () => {

  test("cada porta mostra o proprio estado antes do clique", async ({ page }) => {
    await page.goto("/painel/configuracoes", { waitUntil: "load" });

    const portas = page.getByTestId("configuracoes-portas");
    await expect(portas).toBeVisible({ timeout: 30_000 });

    // O resumo chega quando as consultas respondem; antes disso a porta fica
    // sem linha, que é o certo — não afirma o que ainda não sabe.
    await expect(portas).toContainText(/pessoas|só você/, { timeout: 20_000 });
    await expect(portas).toContainText(/ligadas|nenhuma ligada/);
    await expect(portas).toContainText(/conectado|desconectado/);
  });

  test("papel do banco nunca chega a tela em ingles", async ({ page }) => {
    await page.goto("/painel/configuracoes", { waitUntil: "load" });
    await page.getByTestId("configuracoes-portas").getByRole("button", { name: "Equipe" }).click();

    const equipe = page.getByTestId("configuracoes-equipe");
    await expect(equipe).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 20_000 });

    // A tela antiga imprimia `{m.role}` cru num chip.
    await expect(equipe).not.toContainText("owner");
    await expect(equipe).not.toContainText("operator");
  });

  /**
   * FREE nunca teve cliente no Stripe: `POST /api/billing/portal` devolve 404
   * "Cliente Stripe nao encontrado". Oferecer o botão a esse tenant entrega um
   * erro técnico a quem não fez nada errado — a casca antiga tinha o gate
   * `currentPlanCode !== "FREE"` e ele não pode se perder na migração.
   */
  test("tenant FREE nao recebe botao de cobranca nem link de cancelar", async ({ page }) => {
    await page.route("**/api/subscription", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "active",
          plans: { name: "Free", code: "FREE" },
          current_period_end: null,
          metadata: { stripe_status: "active" },
        }),
      }),
    );

    await page.goto("/painel/configuracoes", { waitUntil: "load" });
    await page.getByTestId("configuracoes-portas").getByRole("button", { name: "Plano" }).click();

    const plano = page.getByTestId("configuracoes-plano");
    await expect(plano).toContainText("Free", { timeout: 30_000 });
    await expect(plano.getByRole("button", { name: "Gerenciar cobrança" })).toHaveCount(0);
    await expect(plano.getByRole("link", { name: "Cancelar assinatura" })).toHaveCount(0);
  });

  /**
   * O defeito que este PR fecha: com `/api/members` fora do ar a lista chegava
   * vazia pelo `catch`, e a tela dizia "Só você por enquanto" para quem tem
   * equipe — a mesma frase de quem realmente está sozinho.
   */
  test("equipe que nao carregou nao vira 'so voce'", async ({ page }) => {
    await page.route("**/api/members", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"caiu"}' }),
    );

    await page.goto("/painel/configuracoes", { waitUntil: "load" });
    await page.getByTestId("configuracoes-portas").getByRole("button", { name: "Equipe" }).click();

    const equipe = page.getByTestId("configuracoes-equipe");
    await expect(equipe).toContainText(/Não deu para carregar a equipe/, { timeout: 30_000 });
    await expect(equipe).not.toContainText("Só você por enquanto");

    // E a porta não inventa contagem para o que não recebeu.
    await expect(page.getByTestId("configuracoes-portas")).not.toContainText("pessoas");
  });
});
