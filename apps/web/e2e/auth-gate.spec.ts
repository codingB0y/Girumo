import { expect, test, type Page } from "@playwright/test";
import { ROTAS_DO_PAINEL, ROTAS_PUBLICAS } from "./rotas";

/**
 * Gate de sessao — roda sem credencial nenhuma.
 *
 * ATENCAO ao que este arquivo NAO prova: redirect para /login sai igual para
 * rota que existe e para rota inventada, porque o middleware intercepta antes
 * do roteamento (achado de 17/08). Entao aqui se prova so que nada do painel
 * vaza sem sessao. Que a rota existe e renderiza e o painel-rotas.spec.ts, que
 * precisa de login.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * URL parseada em vez de regex montada por template: `?` vira quantificador e a
 * asercao passa a comparar outra coisa. Foi assim que a primeira versao deste
 * arquivo falhou nas 24 rotas com a URL correta na tela.
 */
async function caiuNoLoginVoltandoPara(page: Page, rotaEsperada: string) {
  await page.waitForURL((url) => url.pathname === "/login", { timeout: 15_000 });
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next"), "o login perdeu o destino de volta").toBe(rotaEsperada);
}

for (const rota of ROTAS_DO_PAINEL) {
  test(`sem sessao, ${rota} manda para o login`, async ({ page }) => {
    await page.goto(rota);
    await caiuNoLoginVoltandoPara(page, rota);
  });
}

// O controle que o achado de 17/08 pede: se a rota inventada se comportasse
// diferente das reais, o laco acima estaria medindo outra coisa.
test("controle: rota inventada tambem cai no gate (por isso o gate nao prova existencia)", async ({ page }) => {
  await page.goto("/painel/rota-que-nao-existe-999");
  await caiuNoLoginVoltandoPara(page, "/painel/rota-que-nao-existe-999");
});

for (const rota of ROTAS_PUBLICAS) {
  test(`publica: ${rota} abre sem sessao`, async ({ page }) => {
    const resposta = await page.goto(rota);
    expect(resposta?.status(), `${rota} deveria responder 2xx`).toBeLessThan(400);
    // Comparar com a propria rota, e nao com "diferente de /login": /login e
    // uma das publicas, e a versao anterior desta linha se auto-reprovava.
    expect(new URL(page.url()).pathname, `${rota} foi desviada`).toBe(rota);
  });
}
