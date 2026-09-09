import { expect, test } from "@playwright/test";

import { FIXTURES_DINAMICAS } from "./fixtures-dinamicas";

/**
 * Oferta Relampago da Vitrine Aberta (cena 5).
 *
 * Reusa o fixture que ja existe para /painel/relampago/[id]: ele abre a oferta
 * e a FECHA no fim. Deixar uma aberta travaria o indice unico parcial e a
 * proxima execucao levaria 409.
 */

const fixture = FIXTURES_DINAMICAS["/painel/relampago/[id]"];

test.describe("Oferta Relampago na Vitrine Aberta", () => {

  test("a oferta no ar mostra AO VIVO, o relogio e a palavra-chave", async ({ page, request }) => {
    const criada = await fixture.criar(request);
    try {
      await page.goto(`/painel/relampago/${criada.valor}`, { waitUntil: "load" });

      const estado = page.getByTestId("relampago-estado");
      await expect(estado).toHaveText("AO VIVO");
      // Acid em fundo so em Postar, AO VIVO e LOTOU (regra 10) — e este e um deles.
      await expect(estado).toHaveClass(/pn-chip--acid/);

      // O cronometro conta de opened_at. Um "no ar ha" sem numero seria pior que
      // nao ter cronometro: pareceria quebrado.
      await expect(page.getByTestId("relampago-no-ar")).toContainText(/no ar há \d+:\d{2}/);

      // A palavra-chave e o que a cliente digita: sai em Mono, na caixinha.
      await expect(page.getByRole("code")).toContainText("eu quero");
    } finally {
      await criada.apagar?.();
    }
  });

  test("a oferta fechada nao usa Acid nem finge cronometro", async ({ page, request }) => {
    const criada = await fixture.criar(request);
    await criada.apagar?.(); // fecha antes de abrir a tela

    await page.goto(`/painel/relampago/${criada.valor}`, { waitUntil: "load" });

    const estado = page.getByTestId("relampago-estado");
    await expect(estado).toHaveText("FECHADA");
    await expect(estado).not.toHaveClass(/pn-chip--acid/);
    await expect(page.getByTestId("relampago-no-ar")).toHaveCount(0);
  });

  test("a fila vazia diz o que fazer em vez de ficar em branco", async ({ page, request }) => {
    const criada = await fixture.criar(request);
    try {
      await page.goto(`/painel/relampago/${criada.valor}`, { waitUntil: "load" });
      await expect(page.getByTestId("relampago-estado")).toBeVisible();

      const linhas = page.getByTestId("relampago-linha-fila");
      if ((await linhas.count()) === 0) {
        await expect(page.getByText("Ninguém comentou ainda.")).toBeVisible();
        return;
      }

      // Com gente na fila, a posicao e o horario ate o SEGUNDO sao o que separa
      // a 1a da 2a quando duas comentam no mesmo minuto.
      const primeira = linhas.first();
      await expect(primeira).toContainText("1ª");
      await expect(primeira).toContainText(/\d{2}:\d{2}:\d{2}/);
    } finally {
      await criada.apagar?.();
    }
  });

  test("a lista traz a etiqueta de peca, nunca a tabela antiga", async ({ page }) => {
    await page.goto("/painel/relampago", { waitUntil: "load" });
    await page.getByTestId("painel-skeleton").first().waitFor({ state: "detached" });

    const etiquetas = page.getByTestId("relampago-etiqueta");
    if ((await etiquetas.count()) === 0) {
      await expect(page.getByText("Nenhuma oferta ainda.")).toBeVisible();
      return;
    }
    await expect(etiquetas.first()).toHaveClass(/pn-etiqueta-preco/);
    // O cabecalho de tabela da tela antiga nao pode sobreviver na Vitrine.
    await expect(page.getByText("Palavra-chave", { exact: true })).toHaveCount(0);
  });
});
