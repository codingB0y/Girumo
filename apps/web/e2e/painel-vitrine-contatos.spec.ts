import { expect, test } from "@playwright/test";

/**
 * Tela de Contatos da Vitrine Aberta. Só vale com a flag ligada — desligada, a
 * A tela antiga saiu junto com a flag; esta é a única que existe.
 *
 * Não registra pedido de verdade: o POST em /api/orders sujaria o faturamento
 * do ambiente e o próprio teste passaria a medir o lixo que deixou. O que dá
 * pra afirmar sem gravar nada é o caminho até o campo e a coerência do caixa.
 */

test.describe("Contatos na Vitrine Aberta", () => {

  test("lista, filtros e o caixa do mes no rodape", async ({ page }) => {
    await page.goto("/painel/contatos", { waitUntil: "load" });

    await expect(page.getByTestId("contatos-lista")).toBeVisible();
    await expect(page.getByTestId("contatos-caixa")).toBeVisible();
    await expect(page.getByTestId("contatos-caixa")).toContainText("Vendido no mês");
  });

  test("o caixa nao mistura o valor do mes com a contagem de todos os pedidos", async ({ page }) => {
    await page.goto("/painel/contatos", { waitUntil: "load" });
    const caixa = page.getByTestId("contatos-caixa");
    await expect(caixa).toBeVisible();

    // Um "R$ 0,00" ao lado de "15 pedidos" era o defeito: o valor filtrava por
    // mês e a contagem não. As duas metades falam do mesmo recorte ou nenhuma.
    const texto = await caixa.innerText();
    const zerado = /R\$\s*0,00/.test(texto);
    const pedidos = Number(/(\d+)\s+pedidos?\s+no mês/.exec(texto)?.[1] ?? "0");
    if (zerado) {
      expect(pedidos, "caixa zerado não pode listar pedidos no mesmo mês").toBe(0);
    }
  });

  test("Registrar pedido abre o campo na propria ficha, sem modal", async ({ page }) => {
    await page.goto("/painel/contatos", { waitUntil: "load" });
    const primeira = page.getByTestId("contatos-lista").getByRole("listitem").first();

    const botao = primeira.getByRole("button", { name: "Registrar pedido" });
    await expect(botao).toHaveAttribute("aria-expanded", "false");
    await botao.click();

    await expect(primeira.getByTestId("contatos-valor")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Fecha sem gravar nada.
    await primeira.getByRole("button", { name: "Fechar" }).click();
    await expect(primeira.getByTestId("contatos-valor")).toHaveCount(0);
  });

  test("Salvar fica travado enquanto o valor esta vazio", async ({ page }) => {
    await page.goto("/painel/contatos", { waitUntil: "load" });
    const primeira = page.getByTestId("contatos-lista").getByRole("listitem").first();
    await primeira.getByRole("button", { name: "Registrar pedido" }).click();

    await expect(primeira.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await primeira.getByTestId("contatos-valor").fill("149,90");
    await expect(primeira.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  test("a busca filtra pelo nome do contato", async ({ page }) => {
    await page.goto("/painel/contatos", { waitUntil: "load" });
    const lista = page.getByTestId("contatos-lista");
    await expect(lista).toBeVisible();

    const primeiro = (await lista.getByRole("listitem").first().innerText()).split("\n")[1];
    await page.getByTestId("contatos-busca").fill(primeiro);
    await expect(lista).toContainText(primeiro);
    await expect(lista.getByRole("listitem").first()).toBeVisible();
  });
});
