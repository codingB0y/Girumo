import { expect, test } from "@playwright/test";

/**
 * A porta da Vitrine Aberta (spec 2026-09-07, 12.1 e 12.2): as telas de auth.
 * Só vale com a flag ligada — desligada, a casca escura antiga está no ar e
 * este arquivo pula inteiro. Liga no CI no PR 10, junto com a casca.
 *
 * Roda local com NEXT_PUBLIC_PAINEL_VITRINE=on.
 */
const VITRINE = (process.env.NEXT_PUBLIC_PAINEL_VITRINE ?? "").trim().toLowerCase() === "on";

const APARELHO = "girumo.aparelho";

test.describe("porta da Vitrine Aberta", () => {
  test.skip(!VITRINE, "NEXT_PUBLIC_PAINEL_VITRINE desligada: a casca antiga esta no ar");
  // A porta é a tela de quem ainda não entrou: o estado logado não vale aqui.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitante ve a promessa, o campo de e-mail e o Entrar em Cobalt", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByTestId("porta")).toBeVisible();
    await expect(page.getByRole("heading", { name: /seus grupos rodando/i })).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();

    const entrar = page.getByRole("button", { name: "Entrar", exact: true });
    await expect(entrar).toHaveClass(/pn-porta__primario/);
    // Regra 10 da gramática: Acid só em Postar, AO VIVO e LOTOU — nunca num CTA.
    await expect(entrar).not.toHaveClass(/bg-acid/);
  });

  test("aparelho lembrado troca a promessa pelo e-mail de quem ja entrou", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(
      ([chave, valor]) => window.localStorage.setItem(chave, valor),
      [APARELHO, JSON.stringify({ email: "lojista@exemplo.com.br" })],
    );
    await page.reload();

    await expect(page.getByRole("heading", { name: /bem-vinda de volta/i })).toBeVisible();
    await expect(page.getByText("lojista@exemplo.com.br")).toBeVisible();
    // O campo de e-mail sai da frente: quem voltou só precisa da senha.
    await expect(page.getByTestId("login-email")).toHaveCount(0);

    await page.getByRole("button", { name: /entrar com outra conta/i }).click();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-email")).toHaveValue("");
  });

  test("aparelho com lixo no storage cai no estado visitante em vez de quebrar", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(
      ([chave]) => window.localStorage.setItem(chave, "{isso nao e json"),
      [APARELHO],
    );
    await page.reload();

    await expect(page.getByRole("heading", { name: /seus grupos rodando/i })).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("a porta nao busca dado de tenant: e uma tela sem autenticacao", async ({ page }) => {
    // Trava a decisão do PR 4 na causa, não na aparência: os mockups traziam
    // nomes de leads e contagens reais na coluna da esquerda. Numa URL pública
    // isso é dado de terceiro exposto a quem abrir o endereço. Se a porta não
    // chama endpoint de dados, não tem como vazar.
    const proibidas: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (/^\/api\/(leads|disparos|grupos|campanhas|orders|settings|auth\/me)/.test(url.pathname)) {
        proibidas.push(url.pathname);
      }
    });

    await page.goto("/login");
    await expect(page.getByTestId("porta")).toBeVisible();
    await page.waitForTimeout(1000);

    expect(proibidas, "a porta buscou dado do tenant").toEqual([]);
  });

  test("cadastro e recuperar senha usam a mesma porta", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByTestId("porta")).toBeVisible();
    await expect(page.getByRole("button", { name: /criar conta/i }).first()).toHaveClass(/pn-porta__primario/);

    await page.goto("/forgot-password");
    await expect(page.getByTestId("porta")).toBeVisible();
  });

  test("no mobile a porta sobe da base e o campo tem 16px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    const porta = page.getByTestId("porta");
    await expect(porta).toBeVisible();

    // 16px no campo é o que impede o iOS de dar zoom no foco e jogar a porta
    // pra fora da tela.
    const tamanho = await page
      .getByTestId("login-email")
      .evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(tamanho).toBe("16px");
  });
});
