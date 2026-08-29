import { expect, test } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * Fluxo de ponta a ponta da area de Indicacao.
 *
 * Existe porque a area inteira estava morta sem nada acusar: a tela lia
 * `Array.isArray()` numa resposta que e objeto (`{ config, ranking }`), entao a
 * lista ficava SEMPRE vazia; nao havia formulario nenhum, entao o POST era
 * inalcancavel; e o link era gravado no store JSON legado enquanto `/r/:slug`
 * resolve pelo Supabase — ou seja, todo link de indicacao daria 404 em
 * producao. O smoke de rotas nao pegava nada disso: a tela respondia 200 e
 * mostrava um estado-vazio perfeitamente saudavel.
 *
 * Por isso o teste vai ate o fim da corrente: cadastra pela TELA, confere que o
 * caminho mostrado e o mesmo que a API devolveu, e entao BATE no `/r/:slug` de
 * verdade para provar que o link existe e redireciona para o convite. Cada elo
 * sozinho passava; o defeito estava entre eles.
 *
 * O spec limpa o que criou: o tenant de dev e compartilhado, e indicacao
 * esquecida aqui vira ruido no ranking de quem for olhar a tela depois.
 */

type Indicada = {
  id: string;
  referrerName: string;
  slug: string;
  path: string;
  cliques: number;
};

type RespostaIndicacoes = {
  config: { reward: string; goal: number };
  ranking: Indicada[];
};

/** Convite falso: o teste nunca navega ate ele, so confere o `location`. */
const CONVITE = "https://chat.whatsapp.com/E2ENaoNavegarSoConferirRedirect";

/** UA de gente: `/r/:slug` nao conta clique de bot, e o default do runner casa
 * com o filtro de crawler — sem isto o contador ficaria em zero e o teste
 * acusaria um bug que nao existe. */
const UA_HUMANO =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

exigeCredenciais();

test("indicação: cadastra pela tela, o link do ranking redireciona e conta clique, e apagar tira do ar", async ({
  page,
}) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const nome = `QA Indica ${Date.now().toString(36)}`;
  let criada: Indicada | null = null;

  try {
    await page.goto("/painel/indicacao");
    // Ancora do miolo, nao do menu: "Indicação" e o rotulo do item da sidebar e
    // estaria na tela mesmo com a pagina morta.
    await expect(page.getByRole("heading", { name: "Nova indicadora" })).toBeVisible();

    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByLabel("Grupo", { exact: true }).fill("QA Grupo Indicação");
    await page.getByLabel("Link de convite", { exact: true }).fill(CONVITE);
    await page.getByRole("button", { name: "Criar link" }).click();

    // 1) A tela mostra a indicada. Era exatamente isto que nunca acontecia.
    await expect(page.getByText(nome)).toBeVisible();

    // 2) O que a tela mostra e o que a API devolveu — sem link inventado no
    //    cliente. A versao antiga exibia um `/r/indicacao` fixo, igual para
    //    todo mundo e correspondente a link nenhum.
    const resposta = await page.request.get("/api/referrals");
    expect(resposta.ok(), `GET /api/referrals respondeu ${resposta.status()}`).toBeTruthy();
    const { ranking } = (await resposta.json()) as RespostaIndicacoes;
    criada = ranking.find((r) => r.referrerName === nome) ?? null;
    expect(criada, "a indicação criada não voltou no ranking da API").not.toBeNull();
    expect(criada!.path).toBe(`/r/${criada!.slug}`);
    await expect(page.getByRole("button", { name: new RegExp(criada!.slug) })).toBeVisible();

    // 3) O link EXISTE e leva ao convite. Este era o elo quebrado: o link nascia
    //    num store que `/r/:slug` nem consulta.
    const redirect = await page.request.get(criada!.path, {
      maxRedirects: 0,
      headers: { "user-agent": UA_HUMANO },
    });
    expect(redirect.status(), "o link de indicação não redirecionou").toBe(302);
    expect(redirect.headers()["location"]).toBe(CONVITE);

    // 4) O clique entrou na conta de quem indicou. Antes o ranking somava um
    //    arquivo em disco que em producao esta sempre vazio.
    await expect
      .poll(async () => {
        const r = await page.request.get("/api/referrals");
        const { ranking: atual } = (await r.json()) as RespostaIndicacoes;
        return atual.find((x) => x.id === criada!.id)?.cliques ?? 0;
      })
      .toBeGreaterThanOrEqual(1);

    // 5) Apagar remove de verdade: some da tela E o link para de responder.
    page.once("dialog", (d) => void d.accept());
    await page
      .getByRole("button", { name: `Apagar indicação de ${nome}` })
      .click();
    await expect(page.getByText(nome)).toHaveCount(0);

    const depois = await page.request.get(criada!.path, { maxRedirects: 0 });
    expect(depois.status(), "o link continuou de pé depois de apagar a indicação").toBe(404);
    criada = null;

    await semErroDeRuntime(page);
    expect(falhasDeApi, "5xx da propria app durante o fluxo").toEqual([]);
  } finally {
    // Falha no meio do caminho nao pode deixar lixo no tenant compartilhado.
    if (criada) {
      await page.request.delete(`/api/referrals?id=${encodeURIComponent(criada.id)}`);
    }
  }
});
