import { expect, test, type Page } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Bloco "Configurações dos grupos" na aba Grupos da campanha (chamava-se "Ações
 * em massa" até o PR C). Três seções: Identidade, Estado e Manutenção.
 *
 * Desenho por CONTRASTE, como `painel-protecao-grupos.spec.ts`: o número de
 * grupos administrados depende de `groups.is_admin`, que nenhum ambiente
 * garante — em dev pode ser zero, em produção muda a cada sync. Um spec que
 * cobrasse "91 grupos" passaria hoje e quebraria amanhã por dado, não por
 * regresso.
 *
 * A âncora são as APIs que a tela usa; o spec cobra da tela exatamente o que
 * elas responderam.
 *
 * O QUE ISTO PROTEGE DE VERDADE: o alcance é a única frase da tela lida ANTES
 * de uma ação irreversível em 91 grupos de WhatsApp. Se ela dissesse "aplicar
 * em 196" quando o servidor vai aplicar em 91 — ou pior, o contrário — o
 * lojista clicaria sem saber o tamanho do que está fazendo.
 */

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
type Grupo = { id: string; isAdmin?: boolean; sendState?: "open" | "closed" | null };

exigeCredenciais();

/**
 * A campanha cujos grupos REALMENTE resolvem — não só a primeira com
 * `groupIds` não-vazio.
 *
 * A diferença não é teórica. Em dev, `queima-estoque` e `grade-verao` têm o
 * mesmo `created_at`, então a ordem de `/api/campanhas` entre as duas é
 * arbitrária; e `queima-estoque` guarda UUID em `group_ids`, enquanto a tela
 * casa por `whatsapp_group_id`. Escolher "a primeira" fazia o spec ser uma
 * MOEDA: caindo em `queima-estoque`, a tela mostra o estado vazio, o bloco não
 * existe, e o teste falhava por dado de seed, não por regresso.
 *
 * `id` de `/api/groups` é o `whatsapp_group_id` — não o UUID de `groups`.
 */
async function campanhaUsavel(page: Page) {
  const resCampanhas = await page.request.get("/api/campanhas");
  expect(resCampanhas.ok(), `GET /api/campanhas respondeu ${resCampanhas.status()}`).toBeTruthy();
  const campanhas = (await resCampanhas.json()) as Campanha[];

  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const grupos = (await resGrupos.json()) as Grupo[];

  let melhor: { campanha: Campanha; daCampanha: Grupo[] } | null = null;
  for (const campanha of campanhas) {
    const daCampanha = grupos.filter((g) => campanha.groupIds.includes(g.id));
    if (daCampanha.length > (melhor?.daCampanha.length ?? 0)) melhor = { campanha, daCampanha };
  }
  return melhor;
}

test("o alcance do lote reflete os grupos administrados da campanha", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const alvo = await campanhaUsavel(page);
  test.skip(!alvo, "Nenhuma campanha com grupos resolvíveis neste ambiente.");
  if (!alvo) return;

  const { campanha, daCampanha } = alvo;
  const administrados = daCampanha.filter((g) => g.isAdmin).length;

  await page.goto(`/painel/campanhas/${campanha.slug ?? campanha.id}`);

  const bloco = page.getByRole("region", { name: "Configurações dos grupos" });
  await expect(bloco).toBeVisible();

  const alcance = bloco.getByTestId("acoes-massa-alcance");
  await expect(alcance).toContainText(String(administrados));

  if (administrados === 0) {
    // Zero admin não é "tudo certo": é que não há o que aplicar. Afirmar a
    // ausência pega o bug de oferecer um botão que só produziria falha.
    await expect(bloco.getByRole("button", { name: /Aplicar nos/ })).toHaveCount(0);
    await expect(bloco.getByRole("button", { name: "Abrir agora" })).toHaveCount(0);
  } else {
    await expect(
      bloco.getByRole("button", { name: `Aplicar nos ${administrados} grupos` }),
    ).toBeVisible();
    await expect(bloco.getByRole("button", { name: "Abrir agora" })).toBeVisible();
    await expect(bloco.getByRole("button", { name: "Fechar agora" })).toBeVisible();
    // O alcance parcial tem de ser dito: "91" sozinho, num pool de 196, deixaria
    // o lojista achar que o lote cobre a campanha inteira.
    if (administrados !== daCampanha.length) {
      await expect(alcance).toContainText(String(daCampanha.length));
    }
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("o progresso do lote reflete a rota de lotes", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const alvo = await campanhaUsavel(page);
  test.skip(!alvo, "Nenhuma campanha com grupos resolvíveis neste ambiente.");
  if (!alvo) return;

  const slug = alvo.campanha.slug ?? alvo.campanha.id;
  const resLote = await page.request.get(`/api/campanhas/${slug}/grupos/lotes`);
  expect(resLote.ok(), `GET .../grupos/lotes respondeu ${resLote.status()}`).toBeTruthy();
  const lote = (await resLote.json()) as { total: number; done: number; failed: number } | null;

  await page.goto(`/painel/campanhas/${slug}`);
  const bloco = page.getByRole("region", { name: "Configurações dos grupos" });
  await expect(bloco).toBeVisible();

  const progresso = bloco.getByTestId("acoes-massa-progresso");

  if (!lote || lote.total === 0) {
    // Nunca houve lote: mostrar uma barra em 0 de 0 sugeriria que algo está
    // rodando, que é a leitura errada mais provável desta tela.
    await expect(progresso).toHaveCount(0);
  } else {
    await expect(bloco.getByTestId("acoes-massa-contador")).toHaveText(
      `${lote.done + lote.failed} de ${lote.total}`,
    );
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("a contagem de Estado reflete o send_state que a API devolve", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const alvo = await campanhaUsavel(page);
  test.skip(!alvo, "Nenhuma campanha com grupos resolvíveis neste ambiente.");
  if (!alvo) return;

  const { campanha, daCampanha } = alvo;

  // Expectativa DERIVADA em runtime, nunca numero fixo: `send_state` muda a cada
  // lote aplicado, entao "3 abertos" escrito aqui viraria armadilha permanente.
  const abertos = daCampanha.filter((g) => g.sendState === "open").length;
  const fechados = daCampanha.filter((g) => g.sendState === "closed").length;
  const semInfo = daCampanha.length - abertos - fechados;

  await page.goto(`/painel/campanhas/${campanha.slug ?? campanha.id}`);
  const bloco = page.getByRole("region", { name: "Configurações dos grupos" });
  await expect(bloco).toBeVisible();

  if (daCampanha.filter((g) => g.isAdmin).length === 0) {
    // Sem admin o miolo do bloco some — nao ha o que contar nem o que aplicar.
    await expect(bloco.getByTestId("grupos-estado-contagem")).toHaveCount(0);
    expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
    return;
  }

  const contagem = bloco.getByTestId("grupos-estado-contagem");
  await expect(contagem).toContainText(`${abertos} abertos`);
  await expect(contagem).toContainText(`${fechados} fechados`);

  // "Sem informacao" TEM de aparecer quando existe: e o que impede a tela de
  // dizer que um grupo esta aberto quando nunca aplicamos nada nele.
  if (semInfo > 0) {
    await expect(contagem).toContainText(`${semInfo} sem informação`);
  } else {
    await expect(contagem).not.toContainText("sem informação");
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("Revisar links mostra o que a rota de revisao respondeu", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const alvo = await campanhaUsavel(page);
  test.skip(!alvo, "Nenhuma campanha com grupos resolvíveis neste ambiente.");
  if (!alvo) return;

  const slug = alvo.campanha.slug ?? alvo.campanha.id;
  const resRevisao = await page.request.get(`/api/campanhas/${slug}/grupos/revisao`);
  expect(resRevisao.ok(), `GET .../grupos/revisao respondeu ${resRevisao.status()}`).toBeTruthy();
  const revisao = (await resRevisao.json()) as {
    iguais: number;
    trocados: number;
    quebrados: number;
    ultimaRevisao: string | null;
    revisaveis: number;
  };

  await page.goto(`/painel/campanhas/${slug}`);
  const bloco = page.getByRole("region", { name: "Configurações dos grupos" });
  await expect(bloco).toBeVisible();

  const revisar = bloco.getByTestId("grupos-revisar-links");

  if (alvo.daCampanha.filter((g) => g.isAdmin).length === 0) {
    await expect(revisar).toHaveCount(0);
    expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
    return;
  }

  await expect(revisar).toBeVisible();
  await expect(revisar.getByRole("button", { name: "Revisar agora" })).toBeVisible();

  // Nunca revisado NAO pode ser desenhado como "0 quebrados": as duas coisas sao
  // diferentes, e confundi-las e o defeito que este teste existe para pegar.
  if (revisao.ultimaRevisao === null) {
    await expect(revisar.getByTestId("revisao-quando")).toHaveText("Nunca revisado");
    await expect(revisar.getByTestId("revisao-contagens")).toHaveCount(0);
  } else {
    const contagens = revisar.getByTestId("revisao-contagens");
    await expect(contagens).toContainText(`${revisao.iguais} iguais`);
    await expect(contagens).toContainText(`${revisao.trocados} trocados`);
    await expect(contagens).toContainText(`${revisao.quebrados} quebrados`);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
