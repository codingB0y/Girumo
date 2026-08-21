import { expect, test, type Locator, type Page } from "@playwright/test";

import { FIXTURES_DINAMICAS } from "./fixtures-dinamicas";
import { exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * O que a tela `/painel/pages/[id]` FAZ — nao apenas que ela abriu.
 *
 * `painel-rotas-dinamicas.spec.ts` prova que a rota carrega O REGISTRO certo
 * (headline do fixture presente com o id valido, ausente com um id que nao
 * existe). Isso e o piso, nao o teto: uma tela pode carregar a pagina certa e
 * mesmo assim nao salvar nada, e um kit de divulgacao pode montar sem estar
 * ligado aquela pagina. Dois cards do quadro dependiam exatamente dessa
 * diferenca — `paginas-editor-lp` e `paginas-kit-divulgacao` ficaram em
 * `no_ar_nao_verificado` porque "abriu" nunca foi prova de "funciona".
 *
 * Cada teste exercita o comportamento e depois DEVOLVE o ambiente ao estado
 * anterior: a pagina do fixture e reusada entre execucoes (a API nao tem
 * DELETE), entao um teste que deixa lixo contamina o proximo.
 */

const PADRAO = "/painel/pages/[id]";

type LandingPageResumo = {
  id: string;
  slug: string;
  status: "draft" | "published" | "paused";
  target_group_url: string | null;
};

/**
 * Publicar exige destino: `assertPublishable` recusa `status: "published"` sem
 * `campaign_slug` nem `target_group_url` ("Defina o link do grupo ou uma
 * campanha antes de publicar"). A pagina do fixture nasce sem os dois, entao o
 * teste da trava precisa satisfazer essa precondicao antes — senao mede a
 * validacao de destino achando que mede a trava de publicacao.
 */
const DESTINO_DE_TESTE = "https://chat.whatsapp.com/E2E0000000000000000000";

/**
 * Cria (ou reusa) a pagina do fixture e devolve o snapshot do servidor.
 *
 * O `slug` e o `status` vem da API, nunca da tela: sao justamente o que os
 * asserts vao cobrar da tela, e le-los do proprio DOM tornaria o teste
 * circular — ele concordaria com qualquer coisa que a tela mostrasse.
 */
async function prepararPagina(page: Page): Promise<LandingPageResumo> {
  const registro = await FIXTURES_DINAMICAS[PADRAO].criar(page.request);
  const res = await page.request.get(`/api/pages/${registro.valor}`);
  expect(res.ok(), `GET /api/pages/${registro.valor} respondeu ${res.status()}`).toBeTruthy();

  const { page: pagina } = (await res.json()) as { page: LandingPageResumo };
  return pagina;
}

async function definirStatus(page: Page, id: string, status: LandingPageResumo["status"]) {
  const res = await page.request.patch(`/api/pages/${id}`, { data: { status } });
  expect(res.ok(), `PATCH status=${status} respondeu ${res.status()}`).toBeTruthy();
}

/** O grupo "Chamada" nasce fechado; sem abrir, os campos existem e nao aparecem. */
async function abrirGrupo(page: Page, titulo: string) {
  const resumo = page.locator("summary").filter({ hasText: titulo }).first();
  const grupo = page.locator("details").filter({ has: resumo });
  if (!(await grupo.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await resumo.click();
  }
  await expect(grupo).toHaveJSProperty("open", true);
}

test.describe("tela de detalhe da pagina", () => {
  exigeCredenciais();

  /**
   * Card `paginas-editor-lp`.
   *
   * O que separa "editor" de "visualizador" e o dado voltar do servidor. Por
   * isso o assert final vem depois de um `reload()`: o valor tem que sobreviver
   * a ida ao banco e reaparecer no proximo carregamento. Conferir o campo logo
   * apos digitar provaria apenas que o React guardou o que foi digitado — o
   * estado local passa igual com o autosave quebrado.
   *
   * O campo editado e a DESCRICAO, de proposito: a `headline` e a marca que o
   * fixture usa pra se reencontrar entre execucoes, e mexer nela faria cada run
   * criar uma pagina nova (a API nao tem DELETE, entao seriam paginas orfas
   * para sempre).
   */
  test("o editor salva o que foi digitado e o valor volta do servidor", async ({ page }) => {
    const pagina = await prepararPagina(page);
    await page.goto(`/painel/pages/${pagina.id}`);
    await expect(page.locator(".pn-root")).toBeVisible();

    await abrirGrupo(page, "Chamada");
    const descricao = page.getByLabel("Descrição");
    const original = await descricao.inputValue();
    const novo = `E2E autosave ${Date.now().toString(36)}`;

    try {
      await descricao.fill(novo);
      // Autosave por debounce; "Salvo" e o unico sinal de que o PATCH voltou OK.
      await expect(page.getByText(/^Salvo/)).toBeVisible();

      await page.reload();
      await abrirGrupo(page, "Chamada");
      await expect(
        page.getByLabel("Descrição"),
        "o editor recarregou sem o texto digitado — o autosave nao chegou ao servidor",
      ).toHaveValue(novo);

      await semErroDeRuntime(page);
    } finally {
      // Devolve o texto original mesmo se o assert acima falhar.
      await restaurarDescricao(page, pagina.id, original);
    }
  });

  /**
   * Card `paginas-kit-divulgacao`.
   *
   * Duas coisas precisam ser verdade e sao independentes: o kit tem que estar
   * ligado A ESTA pagina (QR e mensagem apontando pro slug dela, nao um
   * placeholder generico), e a trava de publicacao tem que valer — QR impresso
   * e distribuido no bazar continua circulando depois, e apontar pra uma pagina
   * que nao e servida vira link morto na mao do cliente.
   *
   * Os dois lados da trava sao exercitados na mesma execucao. Assertar so o
   * estado em que a pagina ja estava deixaria a trava passar sem nunca ter sido
   * medida.
   */
  test("o kit de divulgacao monta o QR desta pagina e so libera depois de publicar", async ({
    page,
  }) => {
    const pagina = await prepararPagina(page);
    const statusOriginal = pagina.status;
    const destinoOriginal = pagina.target_group_url;

    try {
      await definirStatus(page, pagina.id, "draft");
      if (!destinoOriginal) {
        const res = await page.request.patch(`/api/pages/${pagina.id}`, {
          data: { target_group_url: DESTINO_DE_TESTE },
        });
        expect(res.ok(), `PATCH target_group_url respondeu ${res.status()}`).toBeTruthy();
      }
      await page.goto(`/painel/pages/${pagina.id}`);

      const kit = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Kit de divulgação" }) });
      await expect(kit).toBeVisible();

      // ---- o kit e desta pagina, nao um esqueleto generico
      const qr = kit.locator("canvas");
      await expect(qr).toBeVisible();
      expect(
        await pixelsEscuros(qr),
        "o canvas do QR esta em branco — o codigo nao chegou a ser desenhado",
      ).toBeGreaterThan(0);
      await expect(
        kit.locator("pre"),
        "a mensagem pronta nao cita a URL publica desta pagina",
      ).toContainText(`/p/${pagina.slug}`);

      // ---- trava fechada: rascunho nao divulga
      const whatsapp = kit.locator("a").filter({ hasText: "Enviar no WhatsApp" });
      await expect(kit.getByText(/Publique a página antes de divulgar/)).toBeVisible();
      await expect(kit.getByRole("button", { name: "Baixar QR" })).toBeDisabled();
      await expect(kit.getByRole("button", { name: "Imagem pro story" })).toBeDisabled();
      await expect(whatsapp).toHaveAttribute("aria-disabled", "true");
      expect(
        await whatsapp.getAttribute("href"),
        "rascunho nao pode oferecer link de compartilhar",
      ).toBeNull();

      // ---- trava aberta: publica pelo botao que a lojista usa
      await page.getByRole("button", { name: "Publicar" }).click();
      await expect(kit.getByText(/Publique a página antes de divulgar/)).toHaveCount(0);
      await expect(kit.getByRole("button", { name: "Baixar QR" })).toBeEnabled();

      const href = await whatsapp.getAttribute("href");
      expect(href ?? "", "publicada e ainda sem link de WhatsApp").toContain(
        "https://wa.me/?text=",
      );
      expect(
        decodeURIComponent(href ?? ""),
        "o link do WhatsApp nao leva pra esta pagina",
      ).toContain(`/p/${pagina.slug}`);

      await semErroDeRuntime(page);
    } finally {
      // Ordem importa: despublicar antes de tirar o destino, senao o proprio
      // `assertPublishable` recusa o PATCH que limparia o campo.
      await definirStatus(page, pagina.id, statusOriginal);
      if (!destinoOriginal) {
        await page.request.patch(`/api/pages/${pagina.id}`, {
          data: { target_group_url: null },
        });
      }
    }
  });
});

/** Quantos pixels do canvas sao escuros — QR desenhado vs canvas vazio. */
async function pixelsEscuros(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const alvo = el as HTMLCanvasElement;
    const ctx = alvo.getContext("2d");
    if (!ctx) return 0;

    const { data } = ctx.getImageData(0, 0, alvo.width, alvo.height);
    let escuros = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) escuros += 1;
    }
    return escuros;
  });
}

/**
 * Repoe a descricao original.
 *
 * O PATCH de conteudo substitui o objeto inteiro, entao mandar so a descricao
 * apagaria o resto — inclusive a headline que o fixture usa como marca.
 */
async function restaurarDescricao(page: Page, id: string, descricao: string) {
  const res = await page.request.get(`/api/pages/${id}`);
  const { page: pagina } = (await res.json()) as {
    page: { content: Record<string, unknown> };
  };
  await page.request.patch(`/api/pages/${id}`, {
    data: { content: { ...pagina.content, description: descricao } },
  });
}
