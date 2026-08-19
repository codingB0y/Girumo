import { expect, type Page, test } from "@playwright/test";
import { ESTADO_LOGADO } from "./caminhos";

export const CREDENCIAIS = {
  email: process.env.E2E_EMAIL ?? "",
  senha: process.env.E2E_PASSWORD ?? "",
};

export const TEM_CREDENCIAIS = Boolean(CREDENCIAIS.email && CREDENCIAIS.senha);

/** Sessao gravada pelo auth.setup.ts e reusada pelos specs autenticados. */
export { ESTADO_LOGADO };

/**
 * Marca a suite como skip quando nao ha credencial no ambiente, em vez de
 * falhar. Sem isso, quem clona o repo ve CI vermelho por falta de segredo e
 * aprende a ignorar a suite — que e como suite de teste morre.
 */
export function exigeCredenciais() {
  test.skip(
    !TEM_CREDENCIAIS,
    "Defina E2E_EMAIL e E2E_PASSWORD (usuario do Supabase de dev) para rodar os testes autenticados.",
  );
}

/**
 * Login pela tela real, para os specs que precisam da sessao NASCENDO ali —
 * o de ciclo de sessao, por exemplo, que derruba a sessao no meio. Os demais
 * reusam o estado do setup e nao chamam isto.
 */
export async function entrar(page: Page, destino = "/painel") {
  await page.goto(`/login?next=${encodeURIComponent(destino)}`);
  await page.getByPlaceholder("voce@email.com").fill(CREDENCIAIS.email);
  await page.getByPlaceholder("Sua senha").fill(CREDENCIAIS.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await expect(page.locator(".pn-root")).toBeVisible();
}

/**
 * Erro de runtime do Next aparece como overlay/texto na pagina; sem checar
 * isso, "a rota respondeu 200" convive com a tela quebrada.
 */
export async function semErroDeRuntime(page: Page) {
  await expect(page.getByText("Application error")).toHaveCount(0);
  await expect(page.getByText("Unhandled Runtime Error")).toHaveCount(0);
}
