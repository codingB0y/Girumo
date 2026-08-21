import { expect, test, type Page } from "@playwright/test";

import { exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * O cartao de resultado compartilhavel (P2.17).
 *
 * ONDE ELE VIVE: na HOME do painel, nao em campanhas. O card do quadro nasceu
 * na coluna "Campanhas", mas o mecanismo e `CelebrationModal` renderizado por
 * `home/full-dashboard.tsx`, alimentado por `computeCelebrations` e desenhado
 * por `/api/og`. Nao ha nada de compartilhavel no modulo de campanhas.
 *
 * POR QUE O TESTE MEXE NA META: o modal so aparece quando ha marco ATINGIDO e
 * NAO celebrado. Os tres gatilhos possiveis nao servem igual:
 *
 *   - `group_full:{id}` exigiria criar um grupo lotado, e `/api/groups` nao tem
 *     DELETE — o grupo falso ficaria no tenant para sempre, contando em metrica
 *     e elegivel pro auto-grow.
 *   - `orders_{n}` ja foi celebrado neste tenant, e nao existe caminho pra
 *     descelebrar.
 *   - `goal_hit` sai de um numero em `tenant_settings`, que o proprio teste
 *     baixa e repoe. E o unico gatilho reversivel.
 *
 * POR QUE O POST DE CELEBRACAO E INTERCEPTADO: qualquer clique no modal marca o
 * marco como celebrado, e a marcacao e definitiva (upsert sem contrapartida).
 * Sem o intercept, o teste passaria uma vez e ficaria cego para sempre — a
 * segunda execucao nao veria mais o modal. O intercept pega so o POST; o GET
 * segue ate o servidor, senao o dedupe deixaria de ser exercitado.
 */

/** Baixo o bastante pra que qualquer tenant com lead atinja a meta. */
const META_DE_TESTE = 1;

type Settings = { monthlyGoalContacts: number | null };

async function lerMeta(page: Page): Promise<number | null> {
  const res = await page.request.get("/api/settings");
  expect(res.ok(), `GET /api/settings respondeu ${res.status()}`).toBeTruthy();
  return ((await res.json()) as Settings).monthlyGoalContacts;
}

async function definirMeta(page: Page, valor: number | null) {
  const res = await page.request.patch("/api/settings", {
    data: { monthlyGoalContacts: valor },
  });
  expect(res.ok(), `PATCH /api/settings respondeu ${res.status()}`).toBeTruthy();
}

/**
 * Espera o dashboard TER OS DADOS, nao so ter montado.
 *
 * O modal so e decidido depois que as sete buscas do dashboard voltam, e o
 * `.pn-root` aparece muito antes disso — com o dev server compilando a rota
 * pela primeira vez, a diferenca passou de 10s e o assert do cartao falhou
 * medindo tempo de compilacao em vez de comportamento. Ancorar num numero que
 * so existe com dado carregado elimina esse ruido, e faz o assert NEGATIVO
 * valer: sem isso, "ainda nao carregou" passaria por "nao ha marco".
 */
async function aguardarDashboard(page: Page) {
  await expect(page.locator(".pn-root")).toBeVisible();
  await expect(page.getByText("Contatos captados")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".pn-skeleton")).toHaveCount(0);
}

/** Largura e altura lidas do IHDR — os 8 bytes seguintes ao nome do chunk. */
function lerPng(bytes: Buffer): { assinatura: boolean; largura: number; altura: number } {
  const assinatura =
    bytes.length > 24 && bytes.subarray(1, 4).toString("ascii") === "PNG" && bytes[0] === 0x89;

  return {
    assinatura,
    largura: assinatura ? bytes.readUInt32BE(16) : 0,
    altura: assinatura ? bytes.readUInt32BE(20) : 0,
  };
}

test.describe("cartao de resultado compartilhavel", () => {
  exigeCredenciais();

  test("o marco atingido abre o cartao, e o cartao some quando o marco deixa de valer", async ({
    page,
  }, testInfo) => {
    /*
     * Acima dos 45s do config, e com motivo: este teste carrega o dashboard
     * inteiro DUAS vezes (o caso e o controle) e faz o servidor desenhar tres
     * cartoes — cada `/api/og` monta uma imagem de 1200x630 com fontes
     * baixadas. Cortar qualquer uma dessas partes cortaria a prova junto.
     */
    test.setTimeout(120_000);

    // Blindagem antes de qualquer navegacao: um clique no modal marcaria o
    // marco como celebrado e queimaria o gatilho para as proximas execucoes.
    let tentouCelebrar = false;
    await page.route("**/api/celebrations", async (rota) => {
      if (rota.request().method() === "POST") {
        tentouCelebrar = true;
        await rota.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await rota.continue();
    });

    const metaOriginal = await lerMeta(page);

    try {
      await definirMeta(page, META_DE_TESTE);
      await page.goto("/painel");
      await aguardarDashboard(page);

      const cartao = page.getByRole("heading", { name: /Meta do mês batida/ });
      await expect(
        cartao,
        "meta batida e o cartao nao apareceu — o marco nao chegou ao dashboard",
      ).toBeVisible();

      // O que o lojista tem em maos: a imagem, o envio e o depoimento.
      const baixar = page.getByRole("button", { name: "Baixar imagem" });
      await expect(baixar).toBeVisible();
      await expect(page.getByRole("button", { name: "Enviar no WhatsApp" })).toBeVisible();

      /*
       * O depoimento e exercitado ate a borda do envio, nao alem: o POST em
       * `/api/testimonials` chama `markCelebrated`, e nao ha caminho pra
       * descelebrar — enviar de verdade queimaria o gatilho e deixaria este
       * teste cego a partir da segunda execucao. O que da pra medir sem efeito
       * colateral e a trava dos 10 caracteres, que e o que liga o formulario.
       */
      const depoimento = page.getByPlaceholder(/Consegui encher meus grupos/);
      const enviar = page.getByRole("button", { name: "Enviar", exact: true });
      await expect(depoimento).toBeVisible();
      await expect(enviar, "o envio nasceu liberado com o campo vazio").toBeDisabled();
      await depoimento.fill("Enchi meus grupos em uma semana");
      await expect(enviar, "o campo preenchido nao liberou o envio").toBeEnabled();

      await testInfo.attach("cartao de resultado", {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });

      // ---- o botao abre um cartao de verdade, com os dados DESTE marco
      const [aba] = await Promise.all([
        page.context().waitForEvent("page"),
        baixar.click(),
      ]);
      const urlDoCartao = aba.url();
      await aba.close();

      expect(urlDoCartao, "o botao nao abriu o gerador de cartao").toContain("/api/og?");
      const parametros = new URL(urlDoCartao).searchParams;
      expect(parametros.get("title")).toMatch(/Meta do mês batida/);
      expect(Number(parametros.get("stat")), "o cartao saiu sem numero").toBeGreaterThan(0);

      const imagem = await page.request.get(urlDoCartao);
      expect(imagem.status(), `/api/og respondeu ${imagem.status()}`).toBe(200);
      expect(imagem.headers()["content-type"]).toContain("image/png");

      const png = lerPng(await imagem.body());
      expect(png.assinatura, "/api/og devolveu algo que nao e PNG").toBeTruthy();
      expect(`${png.largura}x${png.altura}`).toBe("1200x630");

      // Controle: se os bytes nao mudassem com o parametro, o cartao seria uma
      // figura fixa e o teste acima estaria medindo um arquivo estatico.
      const outro = new URL(urlDoCartao);
      outro.searchParams.set("stat", String(Number(parametros.get("stat")) + 7));
      const imagemDiferente = await page.request.get(outro.toString());
      expect(imagemDiferente.status()).toBe(200);
      expect(
        (await imagemDiferente.body()).equals(await imagem.body()),
        "trocar o numero nao mudou a imagem — o cartao ignora os parametros",
      ).toBe(false);

      await semErroDeRuntime(page);
    } finally {
      await definirMeta(page, metaOriginal);
    }

    // ---- controle do gatilho: sem meta batida, o cartao nao aparece
    await page.goto("/painel");
    await aguardarDashboard(page);
    await expect(
      page.getByRole("heading", { name: /Meta do mês batida/ }),
      "o cartao continuou na tela com a meta original — ele nao esta olhando o marco",
    ).toHaveCount(0);

    // Se o intercept nunca pegou nada, o clique nao marcou celebracao — mas
    // tambem significa que o mecanismo de dedupe nao foi acionado, e o proximo
    // run pode encontrar outro estado. Falar disso alto e melhor que descobrir
    // depois que o gatilho foi queimado.
    expect(tentouCelebrar, "o clique em 'Baixar imagem' nao tentou marcar o marco").toBe(true);

    const celebrados = (await (await page.request.get("/api/celebrations")).json()) as {
      celebrated: string[];
    };
    expect(
      celebrados.celebrated,
      "o teste queimou o marco 'goal_hit' — a proxima execucao nao veria o cartao",
    ).not.toContain("goal_hit");
  });
});
