import { expect, test, type Page } from "@playwright/test";

import type { EstadoGrupo } from "../src/lib/groups/estado";

/**
 * Tela de Disparos da Vitrine Aberta (cena 2).
 *
 * Nao posta de verdade: um POST na rota de mensagens da campanha poria mensagem
 * na fila de um numero real. O que da pra afirmar sem enviar nada e que a bolha
 * escreve junto e que a conta do alcance e a mesma no aviso e no botao.
 */

const TEXTO = "BOTA FORA de setembro comecou. Kit infantil 50 pecas, vagas limitadas.";

const NENHUMA = { menos_enchendo: false, lotados: false, com_gente: false };

function grupo(p: Pick<EstadoGrupo, "posicao" | "estado" | "membros" | "naRegra">): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-0000000d0e0${p.posicao}`,
    whatsappGroupId: `e2e-destino-${p.posicao}@g.us`,
    nome: `E2E destino ${p.posicao}`,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/E2EDESTINO${p.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    ...p,
  };
}

// Padrão (menos o que está enchendo): 1 e 3, 1.200 pessoas. Com gente: 1, 2 e 3, 1.700.
const SIMULADOS = [
  grupo({ posicao: 1, estado: "lotado", membros: 1000, naRegra: { menos_enchendo: true, lotados: true, com_gente: true } }),
  grupo({ posicao: 2, estado: "enchendo", membros: 500, naRegra: { ...NENHUMA, com_gente: true } }),
  grupo({ posicao: 3, estado: "fila", membros: 200, naRegra: { ...NENHUMA, menos_enchendo: true, com_gente: true } }),
  grupo({ posicao: 4, estado: "vazio", membros: 0, naRegra: NENHUMA }),
];
const ESTADOS = {
  grupos: SIMULADOS,
  contagem: { lotado: 1, enchendo: 1, fila: 1, vazio: 1, membros: 1700 },
  regras: { menos_enchendo: 2, lotados: 1, com_gente: 3 },
  estruturaDeComunidade: [],
};
const GRUPOS_SIMULADOS = SIMULADOS.map((g) => ({
  id: g.groupId,
  whatsappGroupId: g.whatsappGroupId,
  name: g.nome,
  members: g.membros,
  capacity: g.capacidade,
  selected: false,
  engagement: "medio",
  isAdmin: true,
}));

/**
 * Os grupos simulados entram em `/grupos/estados` e em `/api/groups`, que é de onde
 * sai a conta das pessoas: a campanha do tenant de E2E não tem grupo com estado, e
 * um teste que pula no CI não prova nada.
 */
async function simularGruposDoDestino(page: Page) {
  await page.route("**/grupos/estados", (rota) => rota.fulfill({ json: ESTADOS }));
  await page.route("**/api/groups", async (rota) => {
    if (rota.request().method() !== "GET") return rota.continue();
    const real = await rota.fetch();
    const lista = real.ok() ? ((await real.json()) as unknown[]) : [];
    return rota.fulfill({ json: [...lista, ...GRUPOS_SIMULADOS] });
  });
}

const jid = (posicao: number) => `e2e-destino-${posicao}@g.us`;

/** `GET /api/groups/posts-hoje` com o teto do dia e os grupos que já postaram hoje. */
async function simularPostsHoje(page: Page, grupos: Record<string, number>) {
  await page.route("**/api/groups/posts-hoje", (rota) => rota.fulfill({ json: { teto: 4, grupos } }));
}

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

  test("post recusado pela API nao apaga o que foi escrito", async ({ page }) => {
    // O POST nunca chega ao servidor: a recusa e simulada. Antes do C39 o
    // compositor zerava texto, midia e enquete mesmo com 409 (numero
    // desconectado) ou 402 (limite do plano), e o lojista reescrevia tudo.
    const RECUSA = "WhatsApp desconectado. Reconecte o número para postar.";
    await page.route("**/api/campanhas/*/messages", (rota) =>
      rota.request().method() === "POST"
        ? rota.fulfill({ status: 409, json: { error: RECUSA } })
        : rota.continue(),
    );
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const campo = page.getByPlaceholder("Digite sua mensagem...");
    await campo.fill(TEXTO);
    await page.getByRole("button", { name: /^Postar/ }).click();

    await expect(page.getByText(RECUSA)).toBeVisible();
    await expect(campo).toHaveValue(TEXTO);
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
    await simularGruposDoDestino(page);
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const alcance = page.getByTestId("disparos-alcance");
    await expect(alcance).not.toContainText("Contando");
    const destino = page.getByTestId("destino-grupos");
    const atalhos = destino.getByRole("group", { name: "Atalhos de destino" });
    const postar = page.getByRole("button", { name: /^Postar/ });
    const avisoEnchendo = destino.getByRole("alert").filter({ hasText: "está recebendo gente" });

    // D5: sem escolher nada, o post vai para todos menos o que está enchendo.
    const padrao = atalhos.getByRole("button", { name: /^Todos menos o que está enchendo/ });
    await expect(padrao).toHaveAttribute("aria-pressed", "true");
    await expect(padrao).toContainText("2");
    await expect(alcance).toHaveText("Vai pra 2 grupos · 1.200 pessoas veem");
    await expect(postar).toHaveText("Postar em 2 grupos");
    await expect(avisoEnchendo).toHaveCount(0);

    // Trocar o atalho muda o aviso e o botão juntos, e o que está enchendo ganha o aviso amarelo.
    await atalhos.getByRole("button", { name: /^Todos com gente/ }).click();
    await expect(alcance).toHaveText("Vai pra 3 grupos · 1.700 pessoas veem");
    await expect(postar).toHaveText("Postar em 3 grupos");
    await expect(avisoEnchendo).toContainText("E2E destino 2");

    await test.info().attach("disparos-destino", { body: await destino.screenshot(), contentType: "image/png" });
  });

  test("grupos no limite do dia aparecem antes de postar", async ({ page }) => {
    // O 1 e o 2 já receberam o teto hoje. O padrão (1 e 3) só tem o 1; "Todos com gente"
    // soma o 2: a frase acompanha o destino e o botão nunca é travado por ela.
    await simularGruposDoDestino(page);
    await simularPostsHoje(page, { [jid(1)]: 4, [jid(2)]: 4 });
    await page.goto("/painel/disparos", { waitUntil: "load" });

    const postar = page.getByRole("button", { name: /^Postar/ });
    await page.getByPlaceholder("Digite sua mensagem...").fill(TEXTO);

    await expect(page.getByText("1 de 2 grupos já receberam 4 posts hoje e vão ficar de fora.")).toBeVisible();
    await expect(postar).toBeEnabled();

    await page
      .getByTestId("destino-grupos")
      .getByRole("group", { name: "Atalhos de destino" })
      .getByRole("button", { name: /^Todos com gente/ })
      .click();
    await expect(page.getByText("2 de 3 grupos já receberam 4 posts hoje e vão ficar de fora.")).toBeVisible();
    await expect(postar).toBeEnabled();
  });

  test("todos no limite: avisa que o post não vai sair", async ({ page }) => {
    await simularGruposDoDestino(page);
    await simularPostsHoje(page, { [jid(1)]: 4, [jid(2)]: 4, [jid(3)]: 4, [jid(4)]: 4 });
    await page.goto("/painel/disparos", { waitUntil: "load" });

    await page.getByPlaceholder("Digite sua mensagem...").fill(TEXTO);

    await expect(
      page.getByText("Todos estes grupos já receberam 4 posts hoje. O post não vai sair; o limite volta à meia-noite."),
    ).toBeVisible();
    // Quem decide é o banco, no envio: o botão segue habilitado.
    await expect(page.getByRole("button", { name: /^Postar/ })).toBeEnabled();
  });

  test("contagem fora do ar não mostra linha nem trava o botão", async ({ page }) => {
    await simularGruposDoDestino(page);
    await page.route("**/api/groups/posts-hoje", (rota) =>
      rota.fulfill({ status: 500, json: { error: "Não deu para ler os posts de hoje." } }),
    );
    const lida = page.waitForResponse((r) => r.url().includes("/api/groups/posts-hoje"));
    await page.goto("/painel/disparos", { waitUntil: "load" });
    await lida;

    await expect(page.getByTestId("disparos-alcance")).not.toContainText("Contando");
    await page.getByPlaceholder("Digite sua mensagem...").fill(TEXTO);

    await expect(page.getByText(/posts hoje/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Postar/ })).toBeEnabled();
  });
});
