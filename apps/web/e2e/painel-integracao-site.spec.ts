import { expect, test } from "@playwright/test";

/**
 * Configurações › Integrações › Site próprio (funil de anúncios, PR 3b).
 *
 * Só lê. Gerar chave aqui trocaria a chave da loja de QA no banco de dev que
 * todo run compartilha (quem gera chave e restaura o estado é
 * `painel-anuncios-cadeia.spec.ts`). Por isso este teste aceita qualquer das
 * quatro situações: não assume que a loja de QA está sem integração. O que ele
 * guarda é o que o PostgREST falso dos testes de rota não vê: as consultas do GET
 * (colunas, filtros, HEAD) contra o banco de verdade, e a porta nova ligada na
 * Vitrine.
 */
test("a porta Integrações abre o site próprio com a situação e os parâmetros", async ({ page }) => {
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });

  const porta = page.getByTestId("configuracoes-portas").getByRole("button", { name: /Integrações/ });
  await expect(porta).toHaveAttribute("aria-current", "true", { timeout: 30_000 });

  const site = page.getByTestId("configuracoes-site");
  await expect(site.getByRole("heading", { name: "Site próprio" })).toBeVisible({ timeout: 30_000 });
  await expect(site).not.toContainText("Não deu para carregar");
  await expect(site.getByRole("button", { name: "Copiar parâmetros" })).toBeVisible();
  await expect(site).toContainText("utm_source={{site_source_name}}");
  await expect(site).toContainText(
    /Integração desligada|Esperando o primeiro cadastro|Recebendo cadastros|Sem cadastros há mais de um dia/,
  );
});
