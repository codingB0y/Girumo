import { expect, test } from "@playwright/test";

/**
 * Automações na Vitrine Aberta. Só vale com a flag ligada — desligada, a tela
 * antiga está no ar e este arquivo pula inteiro.
 *
 * Existe por causa de um defeito achado na revisão do PR 11: a `Folha` nasceu
 * como peça da casca MOBILE (`lg:hidden`), porque os gatilhos dela viviam na
 * `BarraMobile`, que também some no desktop. A tela nova passou a abrir a mesma
 * folha por um botão que aparece em QUALQUER largura — e em telas ≥1024px o
 * clique não produzia nada: sem modal, sem erro, sem log.
 *
 * Nenhum gate pegou. Lint, tsc e build não avaliam media query; e um teste que
 * lê `innerText` também não, porque `innerText` devolve o texto de um elemento
 * com `display: none`. Só `toBeVisible()` — que consulta o layout de verdade —
 * separa "existe no DOM" de "a lojista consegue usar".
 */

test.describe("Automações na Vitrine Aberta", () => {

  test("a folha de modelos abre VISIVEL no desktop, nao so no DOM", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/painel/automacoes", { waitUntil: "load" });

    const abrir = page.getByRole("button", { name: "Nova automação" });
    await expect(abrir).toBeVisible({ timeout: 30_000 });
    await expect(abrir).toHaveAttribute("aria-expanded", "false");

    await abrir.click();

    const folha = page.getByTestId("folha-templates");
    await expect(folha).toBeVisible({ timeout: 10_000 });
    await expect(folha).toHaveAttribute("role", "dialog");
    await expect(abrir).toHaveAttribute("aria-expanded", "true");

    // Um modelo de verdade dentro dela, e não só a moldura.
    await expect(folha.getByRole("button", { name: /Boas-vindas no grupo/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(folha).toBeHidden();
  });

  test("a folha tambem abre no celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/painel/automacoes", { waitUntil: "load" });

    const abrir = page.getByRole("button", { name: "Nova automação" });
    await expect(abrir).toBeVisible({ timeout: 30_000 });
    await abrir.click();
    await expect(page.getByTestId("folha-templates")).toBeVisible({ timeout: 10_000 });
  });

  test("gatilho de lifecycle do SaaS nunca aparece pro lojista", async ({ page }) => {
    await page.goto("/painel/automacoes", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Automações", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    // TRIGGER_LABELS não tem rótulo para estes dois, então um vazamento não
    // mostraria "um item a mais": mostraria o slug cru na tela de quem paga.
    const corpo = page.locator("body");
    await expect(corpo).not.toContainText("trial_ending");
    await expect(corpo).not.toContainText("no_connect_24h");
  });

  test("o interruptor diz o estado por acessibilidade, nao so por cor", async ({ page }) => {
    await page.goto("/painel/automacoes", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Automações", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    // Esperar a tela SAIR do esqueleto antes de contar. Sem isto o `count()`
    // corre contra o fetch, dá zero e o teste se pula sozinho — um skip por
    // corrida esconde ausência de cobertura sem nunca ficar vermelho.
    await expect(page.locator(".pn-card").first()).toBeVisible({ timeout: 30_000 });

    const interruptores = page.getByRole("switch");
    const quantos = await interruptores.count();
    test.skip(quantos === 0, "tenant de teste sem automacao criada (estado vazio, nao corrida)");

    const primeiro = interruptores.first();
    await expect(primeiro).toHaveAttribute("aria-checked", /true|false/);
    // O nome acessível diz o que o clique faz E de qual automação — "Ligar"
    // sozinho se repetiria em toda linha da lista.
    await expect(primeiro).toHaveAttribute("aria-label", /^(Ligar|Desligar) .+/);
  });
});
