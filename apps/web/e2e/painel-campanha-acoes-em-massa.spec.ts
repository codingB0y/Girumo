import { expect, test } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Bloco "Ações em massa" na aba Grupos da campanha.
 *
 * Desenho por CONTRASTE, como `painel-protecao-grupos.spec.ts`: o número de
 * grupos administrados depende de `groups.is_admin`, que nenhum ambiente
 * garante — em dev pode ser zero, em produção muda a cada sync. Um spec que
 * cobrasse "91 grupos" passaria hoje e quebraria amanhã por dado, não por
 * regresso.
 *
 * A âncora são as duas APIs que a tela usa; o spec cobra da tela exatamente o
 * que elas responderam.
 *
 * O QUE ISTO PROTEGE DE VERDADE: o alcance é a única frase da tela lida ANTES
 * de uma ação irreversível em 91 grupos de WhatsApp. Se ela dissesse "aplicar
 * em 196" quando o servidor vai aplicar em 91 — ou pior, o contrário — o
 * lojista clicaria sem saber o tamanho do que está fazendo.
 */

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
type Grupo = { id: string; isAdmin?: boolean; sendState?: "open" | "closed" | null };

exigeCredenciais();

test("o alcance do lote reflete os grupos administrados da campanha", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const resCampanhas = await page.request.get("/api/campanhas");
  expect(resCampanhas.ok(), `GET /api/campanhas respondeu ${resCampanhas.status()}`).toBeTruthy();
  const campanhas = (await resCampanhas.json()) as Campanha[];

  // Sem campanha com grupo não há bloco a cobrar — e inventar uma aqui criaria
  // dado que o próximo spec herdaria sujo.
  const campanha = campanhas.find((c) => c.groupIds.length > 0);
  test.skip(!campanha, "Nenhuma campanha com grupos neste ambiente.");
  if (!campanha) return;

  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const grupos = (await resGrupos.json()) as Grupo[];

  const daCampanha = grupos.filter((g) => campanha.groupIds.includes(g.id));
  const administrados = daCampanha.filter((g) => g.isAdmin).length;

  await page.goto(`/painel/campanhas/${campanha.slug ?? campanha.id}`);

  const bloco = page.getByRole("region", { name: "Ações em massa" });
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

  const resCampanhas = await page.request.get("/api/campanhas");
  const campanhas = (await resCampanhas.json()) as Campanha[];
  const campanha = campanhas.find((c) => c.groupIds.length > 0);
  test.skip(!campanha, "Nenhuma campanha com grupos neste ambiente.");
  if (!campanha) return;

  const slug = campanha.slug ?? campanha.id;
  const resLote = await page.request.get(`/api/campanhas/${slug}/grupos/lotes`);
  expect(resLote.ok(), `GET .../grupos/lotes respondeu ${resLote.status()}`).toBeTruthy();
  const lote = (await resLote.json()) as { total: number; done: number; failed: number } | null;

  await page.goto(`/painel/campanhas/${slug}`);
  const bloco = page.getByRole("region", { name: "Ações em massa" });
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
