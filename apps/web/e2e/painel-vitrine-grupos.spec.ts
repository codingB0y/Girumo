import { expect, test } from "@playwright/test";

/**
 * Tela de Grupos da Vitrine Aberta (spec 12.5). Só vale com a flag ligada —
 * desligada, a tela antiga está no ar e este arquivo pula inteiro. Liga no CI
 * no PR 10, junto com a casca.
 *
 * Roda local com NEXT_PUBLIC_PAINEL_VITRINE=on.
 */
const VITRINE = (process.env.NEXT_PUBLIC_PAINEL_VITRINE ?? "").trim().toLowerCase() === "on";

test.describe("Grupos na Vitrine Aberta", () => {
  test.skip(!VITRINE, "NEXT_PUBLIC_PAINEL_VITRINE desligada: a tela antiga esta no ar");

  test("prateleira, romaneio e lista aparecem, e o romaneio bate com a lista", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });

    await expect(page.getByTestId("grupos-prateleira")).toBeVisible();
    await expect(page.getByTestId("grupos-romaneio")).toBeVisible();
    await expect(page.getByTestId("grupos-lista")).toBeVisible();

    // Contraste em runtime: a prateleira tem uma caixa por grupo, e o romaneio
    // conta os mesmos grupos. Se as duas fontes divergirem, uma está mentindo.
    const caixas = await page.getByTestId("grupos-prateleira").locator("> *").count();
    const romaneio = await page.getByTestId("grupos-romaneio").innerText();
    const quantos = Number(/pessoas nos ([\d.]+) grupos?/.exec(romaneio)?.[1]?.replace(/\./g, "") ?? "-1");
    expect(quantos, "romaneio e prateleira contam grupos diferentes").toBe(caixas);
  });

  test("o filtro Cheios so deixa quem lotou, e o contador bate com a lista", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    await expect(page.getByTestId("grupos-lista")).toBeVisible();

    const botao = page.getByRole("button", { name: /^Cheios/ });
    const quantos = Number((await botao.innerText()).replace(/\D/g, "") || "0");
    await botao.click();

    const linhas = page.getByTestId("grupos-lista").getByRole("listitem");
    if (quantos === 0) {
      await expect(linhas).toHaveCount(0);
      await expect(page.getByText("Nenhum grupo com esse filtro.")).toBeVisible();
    } else {
      await expect(linhas).toHaveCount(quantos);
      // Todo grupo listado aqui carrega o carimbo — é o Acid desta tela.
      await expect(page.getByTestId("grupos-lista").getByText("LOTOU")).toHaveCount(quantos);
    }
  });

  test("a busca filtra pelo nome do grupo", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const lista = page.getByTestId("grupos-lista");
    await expect(lista).toBeVisible();

    const primeiro = (await lista.getByRole("listitem").first().innerText()).split("\n")[0];
    await page.getByTestId("grupos-busca").fill(primeiro);

    await expect(lista.getByRole("listitem")).toHaveCount(1);
    await expect(lista).toContainText(primeiro);
  });

  test("Configurar abre o editor na propria ficha, sem modal", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const primeira = page.getByTestId("grupos-lista").getByRole("listitem").first();

    const configurar = primeira.getByRole("button", { name: "Configurar" });
    await expect(configurar).toHaveAttribute("aria-expanded", "false");
    await configurar.click();

    await expect(primeira.getByRole("button", { name: "Fechar" })).toBeVisible();
    // Sem diálogo: o editor é parte da ficha.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a lista em repouso nao escreve a URL do convite, nem em campo", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const lista = page.getByTestId("grupos-lista");
    await expect(lista).toBeVisible();

    // Spec 12.5: o botão copia, mas não mostra. Link de grupo na tela é convite
    // aberto para quem estiver olhando por cima do ombro.
    expect(await lista.innerText()).not.toMatch(/chat\.whatsapp\.com/i);

    // `innerText` NÃO lê o value de um input — a primeira versão deste teste
    // passava mesmo com o link à mostra num campo. Aqui a lista está em repouso
    // (nenhum editor aberto), então nenhum campo deve carregar a URL.
    const valores = await lista.locator("input").evaluateAll((campos) =>
      campos.map((c) => (c as HTMLInputElement).value),
    );
    expect(valores.join(" ")).not.toMatch(/chat\.whatsapp\.com/i);

    await expect(lista.getByRole("button", { name: /copiar convite/i }).first()).toBeVisible();
  });

  test("o editor mostra o convite so depois de a lojista abrir a ficha", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const primeira = page.getByTestId("grupos-lista").getByRole("listitem").first();

    // O campo de convite existe para ser editado, então ali a URL aparece de
    // propósito. O que a tela garante é que isso exige uma ação deliberada —
    // não é o estado em que a tela fica aberta no balcão.
    await primeira.getByRole("button", { name: "Configurar" }).click();
    const campos = primeira.locator("input");
    await expect(campos.first()).toBeVisible();
  });
});
