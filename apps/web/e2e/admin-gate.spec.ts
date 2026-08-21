import { expect, test } from "@playwright/test";

import { ROTAS_DO_ADMIN } from "./rotas";
import { exigeCredenciais } from "./sessao-helpers";

/**
 * O painel de PLATAFORMA (/admin) nao vaza para lojista logado.
 *
 * Existe desde 21/08/2026, quando a triagem do quadro mostrou que /admin tinha
 * 13 telas e ZERO cobertura de teste — billing, tenants, impersonation, logs e
 * saude da plataforma, tudo sem uma linha de verificacao. Um `requireAdmin`
 * removido por engano abriria a plataforma inteira e o CI ficaria verde.
 *
 * Por que gate e nao renderizacao: o usuario de QA e lojista comum e nao esta em
 * `platform_admins`. Promove-lo faria estas telas renderizarem, mas quebraria os
 * seis testes H1 de `seguranca-impersonation.spec.ts`, que dependem dele NAO ser
 * admin. Trocar cobertura de seguranca por cobertura de tela seria um mau
 * negocio; cobrir /admin logado exigiria um segundo usuario de QA, admin, com
 * storageState proprio.
 *
 * O QUE FICA DE FORA: `/admin/tenants/[id]` é rota dinâmica, e `coletarRotas`
 * pula essas por precisar de um id que exista. É a tela de detalhe de UM
 * cliente — a mais sensível do conjunto — e hoje nenhum teste a toca. Cobri-la
 * exigiria um tenant fixture com id estável. Anotado aqui para não ser
 * confundida com "coberta" por estar sob /admin.
 *
 * A ARMADILHA que este arquivo evita (mesma de 17/08, ver auth-gate.spec.ts):
 * `requireAdmin` redireciona para `/login?next=/admin`, que e exatamente o que
 * um visitante ANONIMO tambem recebe. Um teste que so olhasse "caiu no login"
 * ficaria verde mesmo se o middleware estivesse barrando por falta de sessao e
 * o `requireAdmin` tivesse sumido. Por isso existe o controle no fim: a MESMA
 * sessao que e barrada aqui tem que ABRIR /painel. Se abrir os dois, ou fechar
 * os dois, o teste nao esta medindo o guard de admin.
 */
test.describe("painel de plataforma nao vaza para lojista", () => {
  exigeCredenciais();

  for (const rota of ROTAS_DO_ADMIN) {
    test(`${rota} recusa lojista logado que nao e admin`, async ({ page }) => {
      await page.goto(rota);

      // A sessao e valida; se a tela montasse, seria vazamento de plataforma.
      await expect(page.locator("body"), `${rota} renderizou para nao-admin`).not.toHaveClass(
        /admin-root/,
      );

      const url = new URL(page.url());
      expect(
        url.pathname,
        `${rota} nao redirecionou — lojista logado chegou no painel de plataforma`,
      ).toBe("/login");
    });
  }

  test("controle: a MESMA sessao abre /painel — logo o que barra /admin e o requireAdmin", async ({
    page,
  }) => {
    // Sem este controle, todos os testes acima passariam com a sessao expirada:
    // anonimo tambem cai em /login. O contraste e a unica coisa que prova que a
    // recusa veio da checagem de admin, e nao de falta de sessao.
    const resposta = await page.goto("/painel");
    expect(resposta?.status(), "/painel respondeu erro com sessao valida").toBeLessThan(400);
    expect(
      new URL(page.url()).pathname,
      "a sessao de QA nao esta valendo — os testes de /admin acima nao provam nada",
    ).not.toBe("/login");
  });
});
