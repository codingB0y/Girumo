import { expect, test } from "@playwright/test";
import { entrar, exigeCredenciais } from "./sessao-helpers";

/**
 * Entrar -> sair -> o acesso cai.
 *
 * O #116 trocou o logout client-side por revogacao server-side. O que se prova
 * aqui e o efeito observavel: o mesmo estado de navegador que abria o painel
 * deixa de abrir.
 *
 * O 401 e medido ANTES e DEPOIS do logout de proposito. Sem o "antes", um 401
 * nao distingue "sessao revogada" de "rota que nao existe" — o middleware
 * responde igual para as duas (achado de 17/08).
 */
test.describe("ciclo de sessao", () => {
  exigeCredenciais();

  // Folga maior so aqui. Este e o unico spec que refaz o login pela tela (os
  // outros reusam o estado do setup), porque ele precisa derrubar a sessao no
  // meio sem levar os demais junto. Somado a isso, o dev server compila a rota
  // sob demanda na primeira chamada: com os 45s padrao o teste estourava por
  // tempo de compilacao, nao por defeito.
  test.describe.configure({ timeout: 120_000 });

  test("logout revoga a sessao que estava valendo", async ({ page }) => {
    await entrar(page);
    await expect(page).toHaveURL(/\/painel/);

    const antes = await page.request.get("/api/auth/me");
    expect(antes.status(), "com sessao valida, /api/auth/me deveria responder 2xx").toBeLessThan(400);

    const logout = await page.request.post("/api/auth/logout");
    expect(logout.status(), "logout deveria responder 2xx").toBeLessThan(400);

    const depois = await page.request.get("/api/auth/me");
    expect(depois.status(), "a mesma sessao continuou valendo depois do logout").toBe(401);

    await page.goto("/painel/grupos");
    await expect(page, "painel continuou abrindo depois do logout").toHaveURL(/\/login\?next=/);
  });
});
