import { expect, test } from "@playwright/test";

/**
 * Tela de Disparos da Vitrine Aberta (cena 2). Roda local com
 * NEXT_PUBLIC_PAINEL_VITRINE=on; liga no CI no PR 10.
 *
 * Nao posta de verdade: um POST na rota de mensagens da campanha poria mensagem
 * na fila de um numero real. O que da pra afirmar sem enviar nada e que a bolha
 * escreve junto e que a conta do alcance e a mesma no aviso e no botao.
 */
const VITRINE = (process.env.NEXT_PUBLIC_PAINEL_VITRINE ?? "").trim().toLowerCase() === "on";

const TEXTO = "BOTA FORA de setembro comecou. Kit infantil 50 pecas, vagas limitadas.";

test.describe("Disparos na Vitrine Aberta", () => {
  test.skip(!VITRINE, "NEXT_PUBLIC_PAINEL_VITRINE desligada: a tela antiga esta no ar");

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

  test("campanha sem grupos nao oferece o destaque de postar", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const alcance = await page.getByTestId("disparos-alcance").innerText();
    const semGrupos = !/Vai pra/.test(alcance);
    test.skip(!semGrupos, "a campanha escolhida tem grupos; nada a afirmar aqui");

    // Acid e reservado a acao que vai acontecer (regra 10). Sem grupo nenhum,
    // postar nao vai acontecer — o botao nao pode gritar.
    const classes = (await page.getByRole("button", { name: /^Postar/ }).getAttribute("class")) ?? "";
    expect(classes).not.toContain("bg-acid");
  });
});

test.describe("Disparos com a Vitrine desligada", () => {
  test.skip(VITRINE, "flag ligada: este bloco cobre o caminho antigo, que e como o CI roda");

  test("a tela antiga nao busca os grupos: a flag cobre o fetch, nao so o JSX", async ({ page }) => {
    // Flag pela metade foi o erro mais caro da serie (PR 4). Cobrar so o JSX
    // deixaria passar um efeito que roda em producao sem ninguem ver.
    let chamadas = 0;
    await page.route("**/api/groups**", (rota) => {
      chamadas += 1;
      return rota.continue();
    });

    await page.goto("/painel/disparos", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Disparos" })).toBeVisible();
    await page.waitForTimeout(1500);

    expect(chamadas, "a tela antiga nao precisa da lista de grupos").toBe(0);
  });

  test("a tela antiga segue intacta e sem nenhuma peca da Vitrine", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });

    // Flag pela metade foi o erro mais caro da serie (PR 4): o JSX ficava atras
    // da flag mas o efeito nao. Aqui nenhuma peca nova pode aparecer.
    await expect(page.getByTestId("disparos-bolha-previa")).toHaveCount(0);
    await expect(page.getByTestId("disparos-alcance")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Postar em/ })).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Disparos" })).toBeVisible();
    const campo = page.getByPlaceholder("Digite sua mensagem...");
    if (await campo.count()) {
      // O rotulo do botao do compositor antigo nao pode ter mudado.
      await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeVisible();
    }
  });
});
