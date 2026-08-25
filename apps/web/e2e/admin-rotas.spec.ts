import { expect, test } from "@playwright/test";
import {
  CONTEUDO_ESPERADO_ADMIN,
  TEM_ACESSO_AO_BANCO,
  contarNoBanco,
  type ContagemEsperada,
} from "./conteudo-esperado-admin";
import { ROTAS_DO_ADMIN } from "./rotas";
import { coletarFalhasDeApi, exigeCredenciaisAdmin, semErroDeRuntime } from "./sessao-helpers";

/**
 * Cobertura de RENDERIZACAO das telas de /admin. D.2 da auditoria de 22/08/2026.
 *
 * Ate aqui as 13 telas de plataforma tinham so cobertura de gate
 * (admin-gate.spec.ts prova que lojista logado nao entra). Ninguem nunca abriu
 * nenhuma delas logado como admin dentro do CI — e foi por isso que o B.1
 * passou: `/admin/billing` mostrando MRR R$ 0,00 e `/admin/instancias` dizendo
 * "nao ha nenhuma" com 6 instancias no banco, sem erro, com a suite verde.
 *
 * Roda num projeto proprio do Playwright, com o storageState do segundo usuario.
 * Ver caminhos.ts para por que sao dois usuarios e nao um.
 */
test.describe("telas de /admin renderizam o dado", () => {
  exigeCredenciaisAdmin();

  /**
   * Guarda de completude, igual a de painel-rotas.spec.ts.
   *
   * `ROTAS_DO_ADMIN` sai do filesystem: tela nova de plataforma aparece sozinha
   * e, sem esta guarda, seria exercitada so pelo gate — nascendo com o mesmo
   * buraco que este arquivo fecha. Aqui ela quebra a suite e cobra a declaracao.
   */
  test("toda rota de /admin declara o conteudo esperado", () => {
    const semDeclaracao = ROTAS_DO_ADMIN.filter((rota) => !CONTEUDO_ESPERADO_ADMIN[rota]);
    expect(
      semDeclaracao,
      `rota sem entrada em conteudo-esperado-admin.ts: ${semDeclaracao.join(", ")}. ` +
        "Declare a ancora e, se a tela tiver lista, a tabela que a alimenta — sem isso " +
        "a tela nasce coberta so por assercoes que passam com ela quebrada.",
    ).toEqual([]);
  });

  for (const rota of ROTAS_DO_ADMIN) {
    test(`${rota} renderiza`, async ({ page }) => {
      const esperado = CONTEUDO_ESPERADO_ADMIN[rota];
      test.skip(!esperado, `${rota} nao tem conteudo declarado; a guarda acima ja cobra.`);

      const falhasDeApi = coletarFalhasDeApi(page);

      const resposta = await page.goto(rota, { waitUntil: "load" });
      expect(resposta?.status(), `${rota} respondeu ${resposta?.status()}`).toBeLessThan(400);

      // Redirect para /login aqui e permissao, nao rota ausente: significa que o
      // usuario saiu de platform_admins ou que a sessao morreu.
      await expect(
        page,
        `${rota} devolveu ao login — o usuario de E2E ainda esta em platform_admins do banco de dev?`,
      ).not.toHaveURL(/\/login/);

      await expect(
        page.locator(".admin-root"),
        `${rota} nao montou o shell de plataforma`,
      ).toBeVisible();
      await semErroDeRuntime(page);

      // ---- ancora: a rota renderizou, nao so o shell -------------------------
      await expect(
        page.getByText(esperado.ancora).first(),
        `${rota} montou o shell mas a propria tela nao renderizou ` +
          `(nada casou ${esperado.ancora})`,
      ).toBeVisible();

      // ---- contraste banco x tela --------------------------------------------
      if (esperado.contagem) await provarQueMostraODado(page, rota, esperado.contagem);

      expect(falhasDeApi, `${rota} teve resposta 5xx: ${falhasDeApi.join(", ")}`).toEqual([]);
    });
  }
});

/**
 * A assercao que o B.1 teria reprovado.
 *
 * Nao ha numero cravado: a expectativa e derivada do banco no momento do teste.
 * Numero fixo aqui viraria armadilha permanente — foi o que aconteceu com a meta
 * do cartao compartilhavel, que quebrou o CI quando o tenant de QA cresceu.
 */
async function provarQueMostraODado(
  page: import("@playwright/test").Page,
  rota: string,
  contagem: ContagemEsperada,
): Promise<void> {
  test.skip(
    !TEM_ACESSO_AO_BANCO,
    "Sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao da para derivar a expectativa do banco.",
  );

  const linhas = await contarNoBanco(contagem.tabela);
  const estadoVazio = page.getByText(contagem.vazio).first();

  if (linhas === 0) {
    // Banco vazio e resultado legitimo: o que se cobra e que a tela DECIDA
    // "vazio", em vez de ficar eternamente no skeleton.
    await expect(
      estadoVazio,
      `${rota}: ${contagem.tabela} esta vazia no banco, entao a tela devia mostrar o estado-vazio`,
    ).toBeVisible();
    return;
  }

  await expect(
    estadoVazio,
    `${rota}: o banco tem ${linhas} linha(s) em ${contagem.tabela}, mas a tela mostrou o ` +
      "estado-vazio. E exatamente o defeito do B.1 — a tela renderizou sem o dado, sem erro nenhum.",
  ).toBeHidden();
}
