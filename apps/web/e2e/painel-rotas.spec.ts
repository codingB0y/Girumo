import { expect, test } from "@playwright/test";
import { ROTAS_DO_PAINEL } from "./rotas";
import { exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * Prova que cada rota do painel existe, renderiza e monta o shell.
 *
 * Diferente do auth-gate, aqui a sessao e real — e so com sessao que dava para
 * distinguir rota viva de rota que sumiu.
 *
 * O screenshot de cada rota vai anexado ao relatorio: e a prova que o quadro
 * exige para `no_ar_verificado`, com data.
 */
test.describe("rotas do painel renderizam", () => {
  exigeCredenciais();

  for (const rota of ROTAS_DO_PAINEL) {
    test(`${rota} renderiza`, async ({ page }, testInfo) => {
      const errosDeConsole: string[] = [];
      page.on("pageerror", (erro) => errosDeConsole.push(erro.message));

      const resposta = await page.goto(rota, { waitUntil: "domcontentloaded" });
      expect(resposta?.status(), `${rota} respondeu ${resposta?.status()}`).toBeLessThan(400);

      // Redirect para o login aqui significa sessao perdida, nao rota ausente.
      await expect(page, `${rota} devolveu ao login com sessao valida`).not.toHaveURL(/\/login/);

      await expect(page.locator(".pn-root"), `${rota} nao montou o shell do painel`).toBeVisible();
      await semErroDeRuntime(page);

      await testInfo.attach(`tela ${rota}`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });

      expect(errosDeConsole, `${rota} lancou erro de runtime: ${errosDeConsole.join(" | ")}`).toEqual([]);
    });
  }
});
