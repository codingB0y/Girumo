import { expect, test } from "@playwright/test";

/**
 * Configurações › Integrações › Yampi (conexão Yampi, PR 6c).
 *
 * O teste lê a resposta que a PRÓPRIA tela pediu e cobra o cartão daquele estado: sem a chave de cifra o GET
 * responde `disponivel: false` sem tocar no banco; com ela, a loja do e2e não tem conexão e o cartão é o de
 * conectar. Só lê: conectar chamaria a Yampi de verdade, que o CI não alcança.
 */

test("o dono vê o cartão da Yampi na porta Integrações, no estado que a rota devolve", async ({ page }) => {
  const leitura = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/integracoes/yampi",
    { timeout: 30_000 },
  );
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });

  const resposta = await leitura;
  expect(resposta.status(), "GET /api/integracoes/yampi do dono").toBe(200);
  expect(resposta.headers()["cache-control"]).toContain("no-store");
  const cartao = (await resposta.json()) as { disponivel?: unknown; conexao?: unknown };

  const yampi = page.getByRole("region", { name: /^Yampi/ });
  await expect(yampi).toBeVisible({ timeout: 30_000 });
  await expect(yampi).not.toContainText("Não deu para carregar");
  if (cartao.disponivel === false) {
    await expect(yampi.getByRole("heading", { name: "Yampi", exact: true })).toBeVisible();
    await expect(yampi).toContainText("Integração com a Yampi indisponível no momento.");
    await expect(yampi.getByRole("button")).toHaveCount(0);
  } else if (cartao.conexao === null) {
    await expect(yampi.getByRole("button", { name: "Conectar Yampi" })).toBeVisible();
    await expect(yampi.getByLabel("User-Token")).toHaveAttribute("type", "password");
  } else {
    await expect(yampi.getByRole("heading", { name: /^Yampi · / })).toBeVisible();
  }
});
