import { expect, type Page } from "@playwright/test";

/**
 * Responde a folha de confirmação do painel (`useConfirmacao`).
 *
 * Substitui o `page.once("dialog", (d) => d.accept())` que os specs usavam
 * enquanto a pergunta era `window.confirm` — o nativo travava o renderer na
 * automação (`finding-window-confirm-congela-automacao`).
 *
 * O `toBeVisible()` é de propósito, e não `toHaveCount(1)`: a folha herda o
 * `lg:hidden` da casca mobile quando alguém esquece o `emQualquerLargura`, e
 * leitura de texto passaria do lado do defeito
 * (`finding-componente-mobile-only-reusado-no-desktop`).
 *
 * @param rotulo texto exato do botão que confirma — é contrato com a tela
 */
export async function confirmarNaFolha(page: Page, rotulo: string) {
  const folha = page.getByTestId("painel-confirmacao");
  await expect(folha, "a folha de confirmação não abriu").toBeVisible();
  await folha.getByRole("button", { name: rotulo, exact: true }).click();
  await expect(folha, "a folha continuou aberta depois de confirmar").toHaveCount(0);
}
