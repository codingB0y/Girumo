import { expect, test, type Page } from "@playwright/test";
import { CONTEUDO_ESPERADO, type ConteudoEsperado } from "./conteudo-esperado";
import { ROTAS_DO_PAINEL } from "./rotas";
import {
  coletarFalhasDeApi,
  esperarShellBuscarDados,
  exigeCredenciais,
  semErroDeRuntime,
} from "./sessao-helpers";

/**
 * Prova que cada rota do painel existe, renderiza e MOSTRA O DADO.
 *
 * O "mostra o dado" chegou em 24/08/2026, pelo achado D.3 da auditoria: ate
 * entao este arquivo tinha quatro assercoes (`status < 400`, shell visivel,
 * `pageerror` vazio, 5xx vazio) e as quatro ficam verdes com a tela quebrada.
 * Uma tela que responde 200, monta o shell e renderiza o miolo vazio passava
 * inteira. Foi assim que o B.1 chegou em producao com o CI verde.
 *
 * As quatro continuam aqui — cada uma pega uma familia de defeito. O que
 * mudou e que elas deixaram de ser as UNICAS:
 *
 *   - ANCORA: um texto que so a rota renderizada tem. Nao o shell (que monta
 *     independente), nao o skeleton, nao a tela de erro. Ela tambem substituiu
 *     o `networkidle` como sincronizacao — ver o comentario no lugar.
 *   - CONTRASTE API x TELA: pergunta a API quantos registros existem e cobra
 *     que a tela concorde. Com dado, a marca do primeiro registro TEM que
 *     aparecer e o estado-vazio NAO pode estar; sem dado, o estado-vazio TEM
 *     que estar. E a assercao que reprova o defeito do B.1.
 *
 * O screenshot de cada rota vai anexado ao relatorio: e a prova que o quadro
 * exige para `no_ar_verificado`, com data.
 */
test.describe("rotas do painel renderizam", () => {
  exigeCredenciais();

  /**
   * O que mantem o mecanismo vivo depois desta sessao.
   *
   * `ROTAS_DO_PAINEL` sai do filesystem, entao tela nova aparece sozinha. Sem
   * esta guarda ela apareceria e seria exercitada so pelas assercoes genericas
   * — que e exatamente o buraco que este PR fecha, voltando pela porta dos
   * fundos. Aqui ela quebra a suite e cobra uma declaracao.
   */
  test("toda rota do painel declara o conteudo esperado", () => {
    const semDeclaracao = ROTAS_DO_PAINEL.filter((rota) => !CONTEUDO_ESPERADO[rota]);
    expect(
      semDeclaracao,
      `rota sem entrada em conteudo-esperado.ts: ${semDeclaracao.join(", ")}. ` +
        "Declare a ancora (e a lista, se a tela tiver uma) — sem isso a tela nasce " +
        "coberta so pelas assercoes que passam com ela quebrada.",
    ).toEqual([]);
  });

  /**
   * O sentido inverso, que faltava.
   *
   * Descoberto ao aposentar o Squad OS: as 6 telas sairam e as 6 entradas aqui
   * ficaram, sem nada reclamar. Declaracao orfa nao quebra a suite — ela MENTE,
   * porque quem le o arquivo conclui que a tela existe e esta coberta. A guarda
   * de cima cobra rota sem declaracao; esta cobra declaracao sem rota.
   */
  test("toda declaracao corresponde a uma rota que existe", () => {
    const orfas = Object.keys(CONTEUDO_ESPERADO).filter((rota) => !ROTAS_DO_PAINEL.includes(rota));
    expect(
      orfas,
      `entrada em conteudo-esperado.ts sem rota correspondente: ${orfas.join(", ")}. ` +
        "A tela saiu e a declaracao ficou para tras — apague a entrada.",
    ).toEqual([]);
  });

  for (const rota of ROTAS_DO_PAINEL) {
    test(`${rota} renderiza`, async ({ page }, testInfo) => {
      const esperado = CONTEUDO_ESPERADO[rota];
      test.skip(!esperado, `${rota} nao tem conteudo declarado; o teste de completude ja cobra.`);

      const errosDeConsole: string[] = [];
      page.on("pageerror", (erro) => errosDeConsole.push(erro.message));
      const falhasDeApi = coletarFalhasDeApi(page);
      const shellBuscouDados = esperarShellBuscarDados(page);

      // "load", nao "domcontentloaded": os chunks precisam ter chegado para o
      // React hidratar e disparar os fetches do shell.
      const resposta = await page.goto(rota, { waitUntil: "load" });
      expect(resposta?.status(), `${rota} respondeu ${resposta?.status()}`).toBeLessThan(400);

      // Redirect para o login aqui significa sessao perdida, nao rota ausente.
      await expect(page, `${rota} devolveu ao login com sessao valida`).not.toHaveURL(/\/login/);

      await expect(page.locator(".pn-root"), `${rota} nao montou o shell do painel`).toBeVisible();
      await semErroDeRuntime(page);

      // ---- ancora: a rota renderizou, nao so o shell -------------------------
      //
      // Isto tambem e a SINCRONIZACAO, e por isso o `networkidle` saiu daqui.
      // `networkidle` assenta quando a rede fica quieta — e em dev ha uma pausa
      // de mais de 500ms entre o `load` e a hidratacao que ele confunde com
      // "acabou". O teste seguia adiante antes de a tela ter pedido qualquer
      // dado e passava por terminar cedo demais. Esperar a ancora e esperar o
      // fato que interessa: o auto-wait do expect segura ate a rota ter
      // renderizado, e estoura se ela nunca renderizar.
      await expect(
        page.getByText(esperado.ancora).first(),
        `${rota} montou o shell mas a propria tela nao renderizou ` +
          `(nada casou ${esperado.ancora}) — skeleton eterno, tela de erro ou miolo vazio`,
      ).toBeVisible();

      await shellBuscouDados;

      // ---- contraste API x tela ----------------------------------------------
      if (esperado.lista) await provarQueMostraODado(page, rota, esperado.lista);

      expect(errosDeConsole, `${rota} lancou erro de runtime: ${errosDeConsole.join(" | ")}`).toEqual(
        [],
      );

      // Depois das esperas, nao antes: uma tela fotografada antes dos dados
      // chegarem prova a tela vazia.
      await testInfo.attach(`tela ${rota}`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });

      // Uma rota de API que devolve 500 e cujo chamador degrada em silencio nao
      // aparece em nenhuma das checagens acima — a tela renderiza "certa" com um
      // pedaco morto dentro. Este assert e o que pega isso.
      expect(falhasDeApi, `${rota} recebeu 5xx da propria app: ${falhasDeApi.join(" | ")}`).toEqual(
        [],
      );
    });
  }
});

/**
 * Pergunta a API o que existe e cobra que a TELA concorde.
 *
 * Os dois lados reprovam, e e de proposito que sejam dois:
 *
 *   - API entregou registro, tela nao mostra → o defeito do B.1. A lista
 *     renderizou vazia apesar de haver dado.
 *   - API nao entregou nada, tela nao mostra o estado-vazio → a tela travou
 *     antes de decidir (skeleton eterno), o que o `status 200` disfarca.
 *
 * A expectativa e derivada, nunca escrita a mao. Numero fixo ("grupos tem 3")
 * viraria armadilha permanente no primeiro dia em que alguem mexesse no tenant
 * de QA — foi assim que a meta do cartao compartilhavel travou o CI.
 */
async function provarQueMostraODado(
  page: Page,
  rota: string,
  lista: NonNullable<ConteudoEsperado["lista"]>,
) {
  // `page.request` e nao o fixture `request`: reusa os cookies vivos desta aba,
  // entao a API responde para a MESMA sessao que abriu a tela. Com o fixture, a
  // resposta viria sem tenant e o contraste compararia coisas diferentes.
  const resposta = await page.request.get(lista.api);
  expect(
    resposta.status(),
    `${rota}: a fonte ${lista.api} respondeu ${resposta.status()}`,
  ).toBeLessThan(400);

  const json: unknown = await resposta.json().catch(() => null);
  const marca = lista.marca(json);

  if (marca === null) {
    await expect(
      page.getByText(lista.vazio).first(),
      `${rota}: ${lista.api} nao devolveu registro, mas a tela tambem nao mostrou o ` +
        `estado-vazio (${lista.vazio}) — ficou no meio do caminho, que e o que o 200 disfarca`,
    ).toBeVisible();
    return;
  }

  // Prefixo, e nao o texto inteiro: alguns componentes cortam o nome em JS antes
  // de renderizar (o corte por CSS nao afeta o DOM, o por JS afeta). Casar pelo
  // comeco evita vermelho por causa de reticencias, sem afrouxar — o piso de 3
  // caracteres de `primeiroTexto` ja barra marca curta demais para provar algo.
  const prefixo = marca.slice(0, 24);

  await expect(
    page.getByText(prefixo).first(),
    `${rota}: ${lista.api} devolveu registro ("${marca}") e a tela nao mostrou nenhum. ` +
      "Este e o defeito do B.1: responde 200, monta o shell e renderiza a lista vazia.",
  ).toBeVisible();

  await expect(
    page.getByText(lista.vazio),
    `${rota}: a tela mostrou o estado-vazio (${lista.vazio}) mesmo com ${lista.api} ` +
      `devolvendo registro ("${marca}")`,
  ).toHaveCount(0);
}
