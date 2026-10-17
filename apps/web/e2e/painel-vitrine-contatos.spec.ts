import { expect, test } from "@playwright/test";

import { formatPhoneBR } from "../src/lib/phone";

/** `LEAD_SEM_NOME` de lib/painel/inicio-carga, que é server-only e não importa aqui. */
const SEM_NOME = "Novo membro";

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

  test("o cabecalho conta a loja inteira, nao a pagina carregada", async ({ page }) => {
    // A tela contava a lista, que o PostgREST corta em 1000: loja de 2444 via "1000 pessoas".
    const contagem = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/leads/contagem");
    await page.goto("/painel/contatos", { waitUntil: "load" });
    const { total, clientes } = (await (await contagem).json()) as { total: number; clientes: number };

    const cabecalho = page.getByTestId("contatos-cabecalho");
    if (total === 0) await expect(cabecalho).toContainText("Ninguém entrou ainda");
    else await expect(cabecalho).toContainText(`${total} ${total === 1 ? "pessoa" : "pessoas"} · ${clientes} `);
  });

  test("a busca acha pelo nome no banco, nao so entre os contatos da tela", async ({ page }) => {
    // O mais antigo com nome: fora da primeira página, que a busca no navegador não alcançava.
    // "Novo membro" é o rótulo de quem chegou sem nome (no banco é NULL): a busca não casa ele.
    const resposta = await page.request.get("/api/leads");
    expect(resposta.ok()).toBe(true);
    const leads = (await resposta.json()) as { name?: string }[];
    const comNome = [...leads].reverse().find((l) => l.name && l.name !== SEM_NOME && /\p{L}/u.test(l.name));
    test.skip(!comNome, "tenant de E2E sem lead com nome");

    await page.goto("/painel/contatos", { waitUntil: "load" });
    const lista = page.getByTestId("contatos-lista");
    await expect(lista).toBeVisible();

    await page.getByTestId("contatos-busca").fill(comNome!.name!);
    await expect(lista.getByRole("listitem").first()).toContainText(comNome!.name!);
  });

  test("a ficha mostra o WhatsApp e a busca acha pelo numero como aparece", async ({ page }) => {
    // O aviso de entrada no grupo não traz nome: a ficha virava "Novo membro"
    // sem número nenhum, e a lojista não tinha como casar a venda com a pessoa.
    const resposta = await page.request.get("/api/leads");
    expect(resposta.ok()).toBe(true);
    const leads = (await resposta.json()) as { phone?: string }[];
    // O mais antigo: a busca vai ao banco, então acha quem está fora da primeira página.
    const comTelefone = [...leads].reverse().find((l) => l.phone);
    test.skip(!comTelefone, "tenant de E2E sem lead com telefone");

    const whatsapp = formatPhoneBR(comTelefone!.phone)!;
    await page.goto("/painel/contatos", { waitUntil: "load" });
    const lista = page.getByTestId("contatos-lista");
    await expect(lista).toBeVisible();

    await page.getByTestId("contatos-busca").fill(whatsapp);
    await expect(lista.getByRole("listitem").first()).toContainText(whatsapp);
  });
});
