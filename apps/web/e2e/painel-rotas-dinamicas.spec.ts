import { expect, test, type Page } from "@playwright/test";

import { FIXTURES_DINAMICAS, montarUrl, type Marca } from "./fixtures-dinamicas";
import { ROTAS_DINAMICAS_DO_PAINEL } from "./rotas";
import { exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * As telas de DETALHE do painel — editor de pagina e campanha.
 *
 * `painel-rotas.spec.ts` cobre as LISTAS; este cobre o que elas abrem. Ate
 * 21/08/2026 nao havia nada aqui: `coletarRotas` pulava `[id]` por precisar de
 * um id que existisse, entao as telas onde o produto realmente acontece
 * passavam inteiras pelo CI. Tres cards do quadro ficaram travados por isso —
 * nao havia como colher a prova por screenshot de uma rota sem id valido.
 *
 * O CONTRASTE e o coracao deste arquivo. Abrir a rota com um id valido e ver
 * "carregou" nao prova nada sozinho: uma tela que ignora o id, ou que renderiza
 * vazio, da o mesmo 200 e o mesmo shell. Por isso cada rota e exercitada DUAS
 * vezes — com o id do fixture e com um id que nao existe — e o teste exige que
 * as duas respostas sejam DIFERENTES. Se um dia derem igual, o teste falha em
 * vez de virar decoracao (a licao de 17/08, quando um probe HTTP "provou" uma
 * rota inventada).
 */
test.describe("rotas dinamicas do painel", () => {
  exigeCredenciais();

  /**
   * O que mantem o mecanismo vivo depois desta sessao.
   *
   * A lista de padroes sai do filesystem, entao tela dinamica nova aparece
   * sozinha. Sem esta guarda ela apareceria e seria ignorada em silencio — que
   * e literalmente como o buraco original nasceu. Aqui ela quebra a suite e
   * cobra um fixture.
   */
  test("todo padrao dinamico do painel tem fixture registrado", () => {
    const semFixture = ROTAS_DINAMICAS_DO_PAINEL.filter((padrao) => !FIXTURES_DINAMICAS[padrao]);
    expect(
      semFixture,
      `rota dinamica sem fixture em fixtures-dinamicas.ts: ${semFixture.join(", ")}. ` +
        "Registre um fixture (ou justifique a ausencia) — sem isso a tela nasce sem cobertura.",
    ).toEqual([]);
  });

  for (const padrao of ROTAS_DINAMICAS_DO_PAINEL) {
    test(`${padrao} carrega o registro do fixture e nao carrega um id inexistente`, async ({
      page,
    }, testInfo) => {
      const fixture = FIXTURES_DINAMICAS[padrao];
      test.skip(!fixture, `${padrao} nao tem fixture; o teste de completude acima ja cobra isso.`);

      const erros: string[] = [];
      page.on("pageerror", (erro) => erros.push(erro.message));

      // `page.request` e nao o fixture `request`: reusa os cookies vivos desta
      // aba, entao o registro nasce na MESMA sessao que vai abri-lo.
      const registro = await fixture.criar(page.request);

      try {
        // ---- lado positivo: o id existe, a tela tem que mostrar o registro
        const url = montarUrl(padrao, registro.valor);
        const resposta = await page.goto(url, { waitUntil: "domcontentloaded" });
        expect(resposta?.status(), `${url} respondeu ${resposta?.status()}`).toBeLessThan(400);
        await expect(page, `${url} devolveu ao login com sessao valida`).not.toHaveURL(/\/login/);
        await expect(page.locator(".pn-root"), `${url} nao montou o shell`).toBeVisible();

        await expect
          .poll(() => contarMarca(page, registro.marca), {
            message: `${url} nao mostrou o registro do fixture — a tela abriu mas ignorou o id`,
          })
          .toBeGreaterThan(0);
        await semErroDeRuntime(page);

        // A prova que o quadro exige para `no_ar_verificado`, com data.
        await testInfo.attach(`tela ${padrao}`, {
          body: await page.screenshot({ fullPage: false }),
          contentType: "image/png",
        });

        // ---- controle: mesmo caminho, id que nao existe
        const urlVazia = montarUrl(padrao, fixture.inexistente);
        const respostaVazia = await page.goto(urlVazia, { waitUntil: "domcontentloaded" });

        // A rota EXISTE (o arquivo foi varrido do filesystem); o que falta e o
        // registro. Um 404 aqui seria outra historia e mereceria falhar.
        expect(
          respostaVazia?.status(),
          `${urlVazia} respondeu ${respostaVazia?.status()} — id inexistente nao deveria derrubar a rota`,
        ).toBeLessThan(400);
        await expect(page.locator(".pn-root"), `${urlVazia} nao montou o shell`).toBeVisible();
        await aguardarTelaAssentar(page);

        expect(
          await contarMarca(page, registro.marca),
          `${urlVazia} mostrou o registro do fixture com um id que NAO existe — ` +
            "a tela nao esta olhando o parametro da rota, e o caso positivo nao prova nada",
        ).toBe(0);

        expect(erros, `${padrao} lancou erro de runtime: ${erros.join(" | ")}`).toEqual([]);
      } finally {
        await registro.apagar();
      }
    });
  }
});

/**
 * Quantas vezes a marca do fixture aparece na tela.
 *
 * Conta em vez de localizar por dois motivos. Um: o mesmo nome costuma sair no
 * cabecalho E no corpo, e um locator solto estoura em strict mode — falha por
 * ambiguidade, que nao e o que o teste quer medir. Dois: valor preenchido em
 * campo nao e texto do documento, e o Playwright nao tem localizador por valor
 * (`getByDisplayValue` e da Testing Library, nao daqui), entao esse caso so se
 * resolve lendo `.value` no DOM.
 */
async function contarMarca(page: Page, marca: Marca): Promise<number> {
  if (marca.tipo === "texto") {
    return page.getByText(marca.valor, { exact: false }).count();
  }
  return page.evaluate((valor) => {
    const campos = Array.from(document.querySelectorAll("input, textarea"));
    return campos.filter((campo) =>
      (campo as HTMLInputElement | HTMLTextAreaElement).value?.includes(valor),
    ).length;
  }, marca.valor);
}

/**
 * O assert negativo passaria de graca se rodasse antes de a tela buscar os
 * dados: "ainda nao carregou" e "nao existe" sao indistinguiveis no primeiro
 * frame. Estas telas sao client-side e so mostram o resultado depois do fetch,
 * entao e preciso deixar a rede sossegar antes de afirmar ausencia.
 */
async function aguardarTelaAssentar(page: Page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    // Tela com polling nunca fica ociosa; o skeleton sumir ja basta como sinal.
  }
  await expect(page.locator(".pn-skeleton")).toHaveCount(0);
}
