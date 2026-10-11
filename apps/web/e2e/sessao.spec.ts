import { expect, test } from "@playwright/test";
import { CREDENCIAIS, CREDENCIAIS_SESSAO, entrar, exigeCredenciaisSessao } from "./sessao-helpers";

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
 *
 * Roda com usuario PROPRIO (E2E_SESSAO_*), nunca o de E2E_EMAIL: a revogacao e
 * por usuario, e com a conta compartilhada este logout derrubava com 401 todo
 * outro run de e2e no ar ao mesmo tempo (23/09/2026). Ver sessao-helpers.ts.
 */
test.describe("ciclo de sessao", () => {
  exigeCredenciaisSessao();

  // Navegador limpo, sem o estado do setup. Com ele vinham o cookie do usuario
  // compartilhado e o "aparelho lembrado", que preenche a tela de login com o
  // e-mail DELE — um tropeco ali e o logout voltava a revogar a conta errada.
  test.use({ storageState: { cookies: [], origins: [] } });

  // Folga maior so aqui. Este e o unico spec que refaz o login pela tela (os
  // outros reusam o estado do setup), porque a sessao que ele derruba precisa
  // nascer aqui. Somado a isso, o dev server compila a rota sob demanda na
  // primeira chamada: com os 45s padrao o teste estourava por tempo de
  // compilacao, nao por defeito.
  test.describe.configure({ timeout: 120_000 });

  // ponytail: dois runs que cheguem aqui a poucos segundos um do outro ainda se
  // cruzam — o logout de um revoga o login recem-feito do outro. So neste spec,
  // e o retry do CI cobre; usuario por run se um dia doer.
  test("logout revoga a sessao que estava valendo", async ({ page }) => {
    // Sem E2E_EMAIL no ambiente, compara com a conta compartilhada do README —
    // e o que o CI usa, e e ela que nao pode ser revogada.
    const compartilhado = CREDENCIAIS.email || "qa-user@girumo.test";
    expect(
      CREDENCIAIS_SESSAO.email.trim().toLowerCase(),
      "E2E_SESSAO_EMAIL e o usuario compartilhado: o logout voltaria a derrubar os outros runs",
    ).not.toBe(compartilhado.trim().toLowerCase());

    await entrar(page, CREDENCIAIS_SESSAO);
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
