import { expect, test, type Page } from "@playwright/test";
import { ROTAS_DO_ADMIN, ROTAS_DO_PAINEL, ROTAS_PUBLICAS } from "./rotas";

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

// O /demo foi removido em 31/08/2026 depois de dois dias anunciado no sitemap
// com prioridade 0.9. Sem o redirect declarado no next.config ele cairia neste
// mesmo gate — 307 para /login, que e `index: false`: soft-404 para quem chega
// pela busca. Os `redirects` do next.config rodam ANTES do middleware, entao a
// pessoa para na home.
test("o /demo removido vai para a home, nao para o gate de sessao", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/");
});

// O controle que o achado de 17/08 pede: se a rota inventada se comportasse
// diferente das reais, o laco acima estaria medindo outra coisa.
test("controle: rota inventada tambem cai no gate (por isso o gate nao prova existencia)", async ({ page }) => {
  await page.goto("/painel/rota-que-nao-existe-999");
  await caiuNoLoginVoltandoPara(page, "/painel/rota-que-nao-existe-999");
});

// O painel de PLATAFORMA tambem nao pode vazar sem sessao. Aqui nao se assere o
// `next`: /admin passa pelo `requireAdmin`, que redireciona com `next=/admin`
// fixo, enquanto o middleware do painel preserva a rota pedida. Cobrar os dois
// formatos no mesmo helper daria falso vermelho.
// Que lojista LOGADO tambem e barrado esta em admin-gate.spec.ts — e la que a
// checagem de admin e de fato exercida.
for (const rota of ROTAS_DO_ADMIN) {
  test(`sem sessao, ${rota} nao abre o painel de plataforma`, async ({ page }) => {
    await page.goto(rota);
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
}

for (const rota of ROTAS_PUBLICAS) {
  test(`publica: ${rota} abre sem sessao`, async ({ page }, testInfo) => {
    const resposta = await page.goto(rota);
    expect(resposta?.status(), `${rota} deveria responder 2xx`).toBeLessThan(400);
    // Comparar com a propria rota, e nao com "diferente de /login": /login e
    // uma das publicas, e a versao anterior desta linha se auto-reprovava.
    expect(new URL(page.url()).pathname, `${rota} foi desviada`).toBe(rota);

    // Screenshot da landing e das telas de entrada: sao a cara do produto para
    // quem chega, e ate 21/08 a suite so conferia o status HTTP delas. Um 200
    // com a pagina em branco passava. O anexo tambem e a prova datada que o
    // quadro exige para mover card de landing a `no_ar_verificado`.
    await page.waitForLoadState("networkidle").catch(() => {
      // Landing com animacao/canvas pode nunca ficar ociosa; o screenshot abaixo
      // vale do mesmo jeito, entao o timeout aqui nao reprova o teste.
    });
    await testInfo.attach(`tela ${rota}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}
