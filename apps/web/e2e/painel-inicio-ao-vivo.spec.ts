import { expect, test, type Locator } from "@playwright/test";

/**
 * Início "Ao vivo" (spec 2026-10-02): a tela padrão de /painel. O tenant de QA
 * não tem número: ela abre com o banner de desconectado e os números da loja.
 */

/** Textos do mapa com menos de 13 px (spec G2, decisão 3). O `pn-chip` é a exceção: chip de estado de 12 px. */
function textosAbaixoDe13px(regiao: Locator): Promise<string[]> {
  return regiao.evaluate((el) =>
    [...el.querySelectorAll("*")]
      // nodeType 3 = texto: só os elementos que escrevem alguma coisa direto.
      .filter((n) => !n.closest(".pn-chip") && [...n.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== ""))
      .filter((n) => parseFloat(getComputedStyle(n).fontSize) < 13)
      .map((n) => (n.textContent ?? "").trim()),
  );
}

/** Quantas colunas tem a grade de células do bloco desta célula. */
function colunasDaGrade(celula: Locator): Promise<number> {
  return celula.evaluate((el) => getComputedStyle(el.closest("ul")!).gridTemplateColumns.split(" ").length);
}

test.describe("Início ao vivo", () => {
  test("abre com a faixa da loja e o número desconectado", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible();
    const faixa = page.getByTestId("inicio-faixa");
    // O chip é "● AO VIVO" (com o ponto): casar por regex, não por texto exato.
    await expect(faixa.getByText(/AO VIVO/)).toBeVisible();
    await expect(faixa.getByText("Entraram hoje")).toBeVisible();
    await expect(faixa.getByText("Pedidos anotados hoje")).toBeVisible();
    await expect(page.getByText("Seu WhatsApp está desconectado")).toBeVisible();
    // O mapa aparece com ou sem grupos no tenant de QA: o título é o mesmo nos dois estados.
    await expect(page.getByTestId("inicio-mapa").getByRole("heading", { name: "Mapa dos grupos" })).toBeVisible();
    await expect(page.getByTestId("inicio-entradas").getByRole("heading", { name: "Entradas e saídas" })).toBeVisible();
    await expect(page.getByTestId("inicio-postando").getByRole("heading", { name: "Postando agora" })).toBeVisible();
    // O tenant de QA não tem oferta aberta: a coluna aparece no estado quieto.
    await expect(page.getByTestId("inicio-relampago").getByRole("heading", { name: "Relâmpago" })).toBeVisible();
  });

  test("nenhum botão ou link em Acid (regra 10)", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[class*="bg-acid"], a[class*="bg-acid"]')).toHaveCount(0);
  });

  test("a partir de 1400 px a Relâmpago fica na terceira coluna, mesmo quieta", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const relampago = await page.getByTestId("inicio-relampago").boundingBox();
    const mapa = await page.getByTestId("inicio-mapa").boundingBox();
    expect(relampago).not.toBeNull();
    expect(mapa).not.toBeNull();
    expect(relampago!.x).toBeGreaterThan(mapa!.x + mapa!.width - 1);
  });

  test("no celular não há rolagem para o lado", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/painel", { waitUntil: "load" });
    // Qual aba abre primeiro depende da loja: não esperar um painel específico.
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    for (const nome of [/Relâmpago/, /Postando/, /Grupos/]) {
      await page.getByRole("tablist", { name: "Seções da tela ao vivo" }).getByRole("tab", { name: nome }).click();
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    }
  });

  test("o link antigo com ?ao-vivo abre a mesma tela", async ({ page }) => {
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible();
  });

  // Não salva: o tenant de QA é compartilhado, e a meta dele não é nossa.
  test("o editor da meta abre na faixa, Esc fecha e devolve o foco ao botão", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const celula = page.getByTestId("inicio-faixa");
    await expect(celula).toBeVisible({ timeout: 30_000 });
    const botao = celula.getByRole("button", { name: /^(definir|editar) meta$/ });
    await botao.click();
    const campo = celula.getByRole("textbox", { name: "Meta do mês em R$" });
    await expect(campo).toBeFocused();
    await expect(celula.getByRole("button", { name: "Salvar" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(campo).toHaveCount(0);
    await expect(botao).toBeFocused();
    // Cancelar fecha do mesmo jeito.
    await botao.click();
    await celula.getByRole("button", { name: "Cancelar" }).click();
    await expect(campo).toHaveCount(0);
    await expect(botao).toBeFocused();
  });
});

test.describe("Início ao vivo no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("as abas trocam a seção, a URL guarda a aba e a tela não rola para o lado", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const abas = page.getByRole("tablist", { name: "Seções da tela ao vivo" });
    await expect(abas).toBeVisible();
    await abas.getByRole("tab", { name: /Grupos/ }).click();
    await expect(page.getByTestId("inicio-mapa")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeHidden();
    await expect(page).toHaveURL(/\?aba=grupos$/);
    await abas.getByRole("tab", { name: /Postando/ }).click();
    await expect(page.getByTestId("inicio-postando")).toBeVisible();
    await expect(page.getByTestId("inicio-mapa")).toBeHidden();
    await abas.getByRole("tab", { name: /Relâmpago/ }).click();
    await expect(page.getByTestId("inicio-relampago")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeHidden();
    for (const nome of [/Relâmpago/, /Postando/, /Grupos/]) {
      await abas.getByRole("tab", { name: nome }).click();
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    }
  });

  test("a faixa do celular: cabeçalho AO VIVO e quatro células roláveis de até 260 px, sem legendas nem Saldo", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa).toBeVisible({ timeout: 30_000 });
    await expect(faixa.getByText(/AO VIVO/)).toBeVisible();
    const medidas = await faixa
      .getByRole("group", { name: "Números de hoje" })
      .evaluate((el) => ({ celulas: [...el.children].map((c) => c.getBoundingClientRect().width), rolagem: getComputedStyle(el).overflowX }));
    expect(medidas.celulas).toHaveLength(4);
    expect(Math.max(...medidas.celulas)).toBeLessThanOrEqual(260);
    // Rola quando não cabe. Com os números pequenos do tenant de QA as quatro podem caber em 390 px,
    // então o contrato é a rolagem ligada, não o conteúdo transbordando.
    expect(medidas.rolagem).toBe("auto");
    await expect(faixa.getByText("Saldo hoje", { exact: true })).toHaveCount(0);
    // Sem legenda no celular (spec G2, decisão 6): a das entradas está no DOM, escondida.
    await expect(faixa.getByText(/^medindo desde|, mesma hora$/).first()).toBeHidden();
    const atualizar = faixa.getByRole("button", { name: "Atualizar agora", includeHidden: true });
    await expect(atualizar).toHaveCount(1);
    await expect(atualizar).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("o mapa é compacto no celular: célula de até 40 px, dez colunas, texto de 13 px e o atalho para os grupos", async ({ page }) => {
    await page.goto("/painel?aba=grupos", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    expect(await celulas.count()).toBeGreaterThan(0);
    const caixa = await celulas.first().boundingBox();
    expect(caixa?.height).toBeLessThanOrEqual(40);
    // No celular todo bloco usa as dez colunas: o lado a lado é a partir de 768 px (spec G2, decisão 7).
    expect(await colunasDaGrade(celulas.first())).toBe(10);
    expect(await textosAbaixoDe13px(mapa)).toEqual([]);
    const ver = mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ });
    await expect(ver).toBeVisible();
    await expect(ver).toHaveAttribute("href", "/painel/grupos");
    expect((await ver.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("setas do teclado movem a seleção entre as abas", async ({ page }) => {
    await page.goto("/painel?aba=relampago", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    const abas = page.getByRole("tablist", { name: "Seções da tela ao vivo" });
    await abas.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(abas.getByRole("tab", { name: /Postando/ })).toHaveAttribute("aria-selected", "true");
    await expect(abas.getByRole("tab", { name: /Postando/ })).toBeFocused();
    await page.keyboard.press("End");
    await expect(abas.getByRole("tab", { name: /Grupos/ })).toHaveAttribute("aria-selected", "true");
  });

  test("?aba= vale ao abrir; valor inválido cai na aba inicial", async ({ page }) => {
    await page.goto("/painel?aba=postando", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-postando")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("inicio-mapa")).toBeHidden();
    await page.goto("/painel?aba=x", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    // Cai na regra da aba inicial: exatamente uma aba selecionada, e é uma das três.
    await expect(page.getByRole("tablist", { name: "Seções da tela ao vivo" }).getByRole("tab", { selected: true })).toHaveCount(1);
  });
});

test.describe("Início ao vivo a partir de 768 px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sem abas: as três seções ficam visíveis ao mesmo tempo", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tablist", { name: "Seções da tela ao vivo" })).toBeHidden();
    await expect(page.getByTestId("inicio-mapa")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeVisible();
    await expect(page.getByTestId("inicio-relampago")).toBeVisible();
  });

  test("o mapa G2: células de 40 px sem percentual, texto de 13 px, filtros com contagem e o atalho Todos os grupos", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    const celulas = mapa.getByTestId("celula-do-grupo");
    expect(await celulas.count()).toBeGreaterThan(0);
    expect((await celulas.first().boundingBox())?.height).toBe(40);
    // Sem o percentual na célula (decisão 7): a lotação é o preenchimento; a dica confirma.
    expect(await celulas.evaluateAll((cs) => cs.filter((c) => (c.textContent ?? "").includes("%")).length)).toBe(0);
    // A partir de 768 px o bloco tem 3, 6 ou 10 colunas, conforme o tamanho da campanha.
    expect([3, 6, 10]).toContain(await colunasDaGrade(celulas.first()));
    expect(await textosAbaixoDe13px(mapa)).toEqual([]);
    await expect(mapa.getByRole("link", { name: "Todos os grupos", exact: true })).toHaveAttribute("href", "/painel/grupos");
    const filtros = mapa.getByRole("group", { name: "Filtrar grupos" });
    await expect(filtros.getByRole("button", { name: /^Todos [\d.]+$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(mapa.getByRole("link", { name: /^Ver (os [\d.]+ grupos|o grupo)$/ })).toBeHidden();
  });

  test("o filtro Lotou leva o selo Acid num span, não no botão, e mostra só os lotados", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const mapa = page.getByTestId("inicio-mapa");
    await expect(mapa).toBeVisible({ timeout: 30_000 });
    // /i: o selo é `pn-chip` (caixa alta por CSS), e o nome acessível pode vir como "Lotou" ou "LOTOU".
    const lotou = mapa.getByRole("group", { name: "Filtrar grupos" }).getByRole("button", { name: /^lotou [\d.]+$/i });
    await expect(lotou.locator(".pn-chip--acid")).toHaveCount(1);
    await lotou.click();
    await expect(lotou).toHaveAttribute("aria-pressed", "true");
    const nomes = await mapa
      .getByTestId("celula-do-grupo")
      .getByRole("link")
      .evaluateAll((ls) => ls.map((l) => l.getAttribute("aria-label") ?? ""));
    // O tenant de QA pode não ter grupo lotado: aí a tela diz isso.
    if (nomes.length === 0) await expect(mapa.getByText('Nenhum grupo em "Lotou".')).toBeVisible();
    for (const nome of nomes) expect(nome).toMatch(/, lotou(, |$)/);
  });

  test("a faixa é uma linha só: AO VIVO, quatro números e o atualizar no fim; o Saldo saiu", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa).toBeVisible({ timeout: 30_000 });
    for (const rotulo of ["Entraram hoje", "Saíram", "Cliques nos links", "Pedidos anotados hoje"]) {
      await expect(faixa.getByText(rotulo, { exact: true })).toBeVisible();
    }
    await expect(faixa.getByText("Saldo hoje", { exact: true })).toHaveCount(0);
    const atualizar = faixa.getByRole("button", { name: "Atualizar agora" });
    await expect(atualizar).toBeVisible();
    await expect(faixa.getByText(/^atualizado (agora|há \d+ (min|h))$|^a série não carregou$/)).toBeVisible();
    const [numeros, botao] = await Promise.all([faixa.getByRole("group", { name: "Números de hoje" }).boundingBox(), atualizar.boundingBox()]);
    expect(numeros).not.toBeNull();
    expect(botao).not.toBeNull();
    // Mesma linha: o botão à direita dos números e dentro da altura deles.
    expect(botao!.x).toBeGreaterThanOrEqual(numeros!.x + numeros!.width - 1);
    const meio = botao!.y + botao!.height / 2;
    expect(meio).toBeGreaterThan(numeros!.y);
    expect(meio).toBeLessThan(numeros!.y + numeros!.height);
    // O botão refaz a carga da tela (a mesma recarga silenciosa do minuto).
    const recarga = page.waitForRequest((r) => r.url().includes("/api/painel/inicio"));
    await atualizar.click();
    await recarga;
  });
});

test.describe("Início ao vivo entre 768 e 1400 px", () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test("a faixa põe AO VIVO e o atualizar numa linha em cima e os quatro números embaixo", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa).toBeVisible({ timeout: 30_000 });
    const grupo = faixa.getByRole("group", { name: "Números de hoje" });
    await expect(grupo.locator(":scope > *")).toHaveCount(4);
    const [numeros, botao] = await Promise.all([grupo.boundingBox(), faixa.getByRole("button", { name: "Atualizar agora" }).boundingBox()]);
    expect(numeros).not.toBeNull();
    expect(botao).not.toBeNull();
    expect(botao!.y + botao!.height).toBeLessThanOrEqual(numeros!.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
