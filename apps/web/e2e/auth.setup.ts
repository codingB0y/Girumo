import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { ESTADO_LOGADO } from "./caminhos";
import { CREDENCIAIS, TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * Loga uma vez e guarda o estado para os specs autenticados reusarem.
 *
 * Sem isto cada teste de rota refazia o login: 24 rotas viravam 24 logins, e a
 * suite passava de tres minutos. Suite lenta e suite que ninguem roda.
 */
setup("autentica uma vez", async ({ page }) => {
  mkdirSync(path.dirname(ESTADO_LOGADO), { recursive: true });

  // Sem credencial os specs autenticados se marcam como skip; o arquivo vazio
  // existe so para o projeto do Playwright conseguir carregar.
  if (!TEM_CREDENCIAIS) {
    writeFileSync(ESTADO_LOGADO, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await page.goto("/login?next=%2Fpainel");
  // Por testid, nao por placeholder: a porta da Vitrine (PR 4) troca os textos
  // dos campos, e o setup nao pode depender de qual casca esta ligada.
  await page.getByTestId("login-email").fill(CREDENCIAIS.email);
  await page.getByTestId("login-senha").fill(CREDENCIAIS.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.getByTestId("painel-root").waitFor({ state: "visible" });

  await page.context().storageState({ path: ESTADO_LOGADO });
});
