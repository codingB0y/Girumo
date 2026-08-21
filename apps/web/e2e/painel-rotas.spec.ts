import { expect, test } from "@playwright/test";
import { ROTAS_DO_PAINEL } from "./rotas";
import {
  coletarFalhasDeApi,
  esperarShellBuscarDados,
  exigeCredenciais,
  semErroDeRuntime,
} from "./sessao-helpers";

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
      const falhasDeApi = coletarFalhasDeApi(page);
      const shellBuscouDados = esperarShellBuscarDados(page);

      // "load", nao "domcontentloaded": os chunks precisam ter chegado para o
      // React hidratar e disparar os fetches do shell. Com domcontentloaded ha
      // uma janela de silencio antes dos chunks que o networkidle la embaixo
      // confunde com "acabou", e o teste passa por terminar cedo demais.
      const resposta = await page.goto(rota, { waitUntil: "load" });
      expect(resposta?.status(), `${rota} respondeu ${resposta?.status()}`).toBeLessThan(400);

      // Redirect para o login aqui significa sessao perdida, nao rota ausente.
      await expect(page, `${rota} devolveu ao login com sessao valida`).not.toHaveURL(/\/login/);

      await expect(page.locator(".pn-root"), `${rota} nao montou o shell do painel`).toBeVisible();
      await semErroDeRuntime(page);

      expect(errosDeConsole, `${rota} lancou erro de runtime: ${errosDeConsole.join(" | ")}`).toEqual([]);

      // O shell so busca seus dados depois de montar, num effect. Sem esperar
      // por isso, o assert abaixo corre antes das respostas chegarem e passa
      // por terminar cedo demais — nao por estar tudo certo.
      await shellBuscouDados;
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      // Depois da espera, nao antes: o screenshot e a prova que o quadro exige,
      // e uma tela fotografada antes dos dados chegarem prova a tela vazia.
      await testInfo.attach(`tela ${rota}`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });

      // Uma rota de API que devolve 500 e cujo chamador degrada em silencio nao
      // aparece em nenhuma das checagens acima — a tela renderiza "certa" com um
      // pedaco morto dentro. Este assert e o que pega isso.
      expect(falhasDeApi, `${rota} recebeu 5xx da propria app: ${falhasDeApi.join(" | ")}`).toEqual(
        [],
      );
    });
  }
});
