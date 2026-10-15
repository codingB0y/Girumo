import { expect, test } from "@playwright/test";

/**
 * Tela de Disparos da Vitrine Aberta (cena 2).
 *
 * Nao posta de verdade: um POST na rota de mensagens da campanha poria mensagem
 * na fila de um numero real. O que da pra afirmar sem enviar nada e que a bolha
 * escreve junto e que a conta do alcance e a mesma no aviso e no botao.
 */

const TEXTO = "BOTA FORA de setembro comecou. Kit infantil 50 pecas, vagas limitadas.";

test.describe("Disparos na Vitrine Aberta", () => {

  test("a bolha escreve junto com o que esta sendo digitado", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const bolha = page.getByTestId("disparos-bolha-previa");
    await expect(bolha).toBeVisible();
    // Antes de digitar a bolha explica o que vai aparecer, em vez de ficar muda.
    await expect(bolha).toContainText("aparece aqui");

    const campo = page.getByPlaceholder("Digite sua mensagem...");
    await campo.fill(TEXTO);
    await expect(bolha).toContainText(TEXTO);

    // A hora e o duplo check fazem a bolha parecer o WhatsApp; sem eles e so um
    // retangulo verde. O check e SVG, entao so da pra cobrar pelo seletor.
    await expect(bolha.locator(".pn-bolha__hora")).toContainText(/\d{2}:\d{2}/);
    await expect(bolha.locator("svg.pn-bolha__check")).toHaveCount(1);
  });

  test("o alcance no aviso e no botao contam a MESMA coisa", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const alcance = page.getByTestId("disparos-alcance");
    await expect(alcance).toBeVisible();
    // A contagem chega depois das campanhas: ler antes disso mede o estado
    // intermediario e o teste vira moeda ao ar.
    await expect(alcance).not.toContainText("Contando");
    const texto = await alcance.innerText();

    const postar = page.getByRole("button", { name: /^Postar/ });
    await expect(postar).toBeVisible();
    const rotulo = await postar.innerText();

    const noAviso = /Vai pra ([\d.]+) grupos?/.exec(texto)?.[1];
    const noBotao = /Postar em ([\d.]+) grupos?/.exec(rotulo)?.[1];

    if (noAviso) {
      // Duas contas do mesmo numero no cliente ja produziram duas verdades na
      // tela (valor do pedido, PR 6). Aqui elas saem da mesma funcao ou falham.
      expect(noBotao, "o botao tem que repetir a contagem do aviso").toBe(noAviso);
    } else {
      // Sem grupos o aviso instrui e o botao nao inventa contagem nenhuma.
      expect(rotulo.trim()).toBe("Postar");
      expect(texto).toMatch(/grupos/);
    }
  });

  test("enquanto os grupos nao chegam, a tela nao afirma que eles sumiram", async ({ page }) => {
    // /api/groups responde depois das campanhas no mundo real. Com a lista
    // ainda vazia, "nao casou nenhum grupo" e indistinguivel de "os grupos
    // sumiram" — e a tela acusava a campanha de estar quebrada.
    await page.route("**/api/groups**", async (rota) => {
      await new Promise((pronto) => setTimeout(pronto, 4000));
      await rota.continue();
    });
    // O alcance agora é o do destino: sem os estados dos grupos também não há conta.
    await page.route("**/grupos/estados**", async (rota) => {
      await new Promise((pronto) => setTimeout(pronto, 4000));
      await rota.continue();
    });

    await page.goto("/painel/disparos", { waitUntil: "load" });

    const alcance = page.getByTestId("disparos-alcance");
    await expect(alcance).toBeVisible();
    await expect(alcance).toContainText("Contando");
    await expect(alcance).not.toContainText("não estão mais na sua lista");

    // E o botao nao pode destacar em Acid uma contagem que ainda nao existe.
    const classes = (await page.getByRole("button", { name: /^Postar/ }).getAttribute("class")) ?? "";
    expect(classes).not.toContain("bg-acid");
  });

  test("campanha sem grupos nao oferece o destaque de postar", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    await expect(page.getByTestId("disparos-alcance")).not.toContainText("Contando");
    const alcance = await page.getByTestId("disparos-alcance").innerText();
    const semGrupos = !/Vai pra/.test(alcance);
    test.skip(!semGrupos, "a campanha escolhida tem grupos; nada a afirmar aqui");

    // Acid e reservado a acao que vai acontecer (regra 10). Sem grupo nenhum,
    // postar nao vai acontecer — o botao nao pode gritar.
    const classes = (await page.getByRole("button", { name: /^Postar/ }).getAttribute("class")) ?? "";
    expect(classes).not.toContain("bg-acid");
  });

  test("o atalho padrão vem marcado e o aviso conta o que ele conta", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const alcance = page.getByTestId("disparos-alcance");
    await expect(alcance).not.toContainText("Contando");
    const destino = page.getByTestId("destino-grupos");
    await expect(destino).toBeVisible();
    test.skip(
      (await destino.getByText("Esta campanha ainda não tem grupos.").count()) > 0,
      "a campanha escolhida não tem grupo com estado; nada a afirmar aqui",
    );

    // D5: sem escolher nada, o post vai para todos menos o que está enchendo.
    const atalho = destino
      .getByRole("group", { name: "Atalhos de destino" })
      .getByRole("button", { name: /^Todos menos o que está enchendo/ });
    await expect(atalho).toHaveAttribute("aria-pressed", "true");

    const noAtalho = /([\d.]+)$/.exec((await atalho.innerText()).trim())?.[1];
    const noAviso = /Vai pra ([\d.]+) grupos?/.exec(await alcance.innerText())?.[1] ?? "0";
    expect(noAviso, "o aviso tem que contar os grupos do atalho escolhido").toBe(noAtalho);

    await test.info().attach("disparos-destino", { body: await destino.screenshot(), contentType: "image/png" });
  });
});
