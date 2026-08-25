import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { ESTADO_ADMIN } from "./caminhos";
import { CREDENCIAIS_ADMIN, TEM_CREDENCIAIS_ADMIN } from "./sessao-helpers";

/**
 * Loga o admin de PLATAFORMA uma vez e guarda o estado.
 *
 * Irmao do auth.setup.ts, separado de proposito: o usuario de QA e um lojista e
 * precisa continuar sendo, porque admin-gate.spec.ts e
 * seguranca-impersonation.spec.ts provam justamente que ele NAO entra em /admin.
 * Um unico usuario nao consegue provar as duas coisas.
 */
setup("autentica o admin de plataforma", async ({ page }) => {
  mkdirSync(path.dirname(ESTADO_ADMIN), { recursive: true });

  // Sem credencial o spec de /admin se marca skip; o arquivo vazio existe so
  // para o projeto do Playwright conseguir carregar.
  if (!TEM_CREDENCIAIS_ADMIN) {
    writeFileSync(ESTADO_ADMIN, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // `next=/admin`, nao `/painel`: este usuario nao tem membership em tenant
  // nenhum (o login tolera — `api/auth/login/route.ts:47` grava tenantId null),
  // entao mandar para o painel do lojista cairia numa tela sem contexto.
  await page.goto("/login?next=%2Fadmin");
  await page.getByPlaceholder("voce@email.com").fill(CREDENCIAIS_ADMIN.email);
  await page.getByPlaceholder("Sua senha").fill(CREDENCIAIS_ADMIN.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });

  // Esperar o shell de plataforma, e nao so a troca de URL: se a conta logar mas
  // nao estiver em `platform_admins`, o guard devolve para /login ou 404 e o
  // storageState gravado seria de uma sessao que nao serve para nada — os 12
  // testes seguintes falhariam um a um sem dizer que a causa e a permissao.
  await page.locator(".admin-root").waitFor({ state: "visible", timeout: 15_000 });

  await page.context().storageState({ path: ESTADO_ADMIN });
});
