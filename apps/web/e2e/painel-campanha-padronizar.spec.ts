import { expect, test, type Page } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * "Padronizar nomes e sequência" de ponta a ponta, menos o WhatsApp: a tela
 * mostra a prévia, as setas mudam a ordem, e aplicar grava no banco a ordem QUE A
 * TELA MOSTRAVA, o molde "<base> {n}" e um job `set_subject` por grupo que muda.
 *
 * Campanha própria do run, com dois grupos fora de qualquer campanha (o trigger
 * de exclusividade recusaria grupo alheio). Apagada no fim — os jobs caem junto
 * (on delete cascade). Sem instância no tenant de E2E os jobs ficam na fila: o
 * rename de verdade é conferido em produção (spec §11 item 4).
 *
 * Os dois grupos têm nomes DISTINTOS: os botões "Subir/Descer" são nomeados pelo
 * nome atual do grupo. `/api/groups` já deixa de fora Pai e Avisos de comunidade
 * (não viram linha nesta tela), então `livres` só tem grupo de disparo.
 */

type Campanha = {
  id: string;
  slug?: string;
  groupIds: string[];
  growTemplate?: Record<string, unknown> | null;
};
type Estado = { whatsappGroupId: string; nome: string; isAdmin: boolean };

exigeCredenciais();

async function lerJson<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(url);
  expect(res.ok(), `GET ${url} respondeu ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

test("padronizar salva a ordem da tela, o molde e um renome por grupo que muda", async ({ page }, testInfo) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const campanhas = await lerJson<Campanha[]>(page, "/api/campanhas");
  const grupos = await lerJson<Array<{ id: string; name: string }>>(page, "/api/groups");
  const emCampanha = new Set(campanhas.flatMap((c) => c.groupIds));
  const nomesVistos = new Set<string>();
  const livres: string[] = [];
  for (const g of grupos) {
    if (livres.length === 2) break;
    if (emCampanha.has(g.id) || nomesVistos.has(g.name)) continue;
    nomesVistos.add(g.name);
    livres.push(g.id);
  }
  test.skip(livres.length < 2, "O tenant de E2E precisa de 2 grupos de nome distinto fora de qualquer campanha.");

  const sufixo = Date.now().toString(36);
  const criada = await page.request.post("/api/campanhas", {
    data: { name: `E2E padronizar ${sufixo}`, groupIds: livres },
  });
  // Corrida no banco de dev compartilhado: outro run pegou o mesmo grupo antes
  // ("um grupo, uma campanha"). Não é regressão desta tela.
  test.skip(criada.status() === 409, "Os grupos livres foram para outra campanha durante o run (corrida no banco de dev).");
  expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}: ${await criada.text()}`).toBeTruthy();
  const campanha = (await criada.json()) as { id: string; slug?: string };
  const slug = campanha.slug ?? campanha.id;

  try {
    // A porta de entrada é o botão do cabeçalho da campanha.
    await page.goto(`/painel/campanhas/${slug}`);
    await page.getByRole("link", { name: "Padronizar nomes e sequência" }).click();
    await expect(page).toHaveURL(new RegExp(`/painel/campanhas/${slug}/padronizar$`));

    const linhas = page.getByTestId("padronizar-linha");
    await expect(linhas).toHaveCount(2);

    const base = `E2E Padrao ${sufixo}`;
    await page.getByLabel("Nome base").fill(base);
    await expect(page.getByText(`${base} 1, ${base} 2, ${base} 3…`)).toBeVisible();

    // Nome acessível é contrato: "Subir <nome>" / "Descer <nome>".
    const antes = await linhas.evaluateAll((els) => els.map((el) => el.getAttribute("data-jid") ?? ""));
    await expect(linhas.nth(0).getByRole("button", { name: /^Subir / })).toBeDisabled();
    await expect(linhas.nth(1).getByRole("button", { name: /^Descer / })).toBeDisabled();
    await linhas.nth(0).getByRole("button", { name: /^Descer / }).click();
    const depois = await linhas.evaluateAll((els) => els.map((el) => el.getAttribute("data-jid") ?? ""));
    expect(depois).toEqual([antes[1], antes[0]]);

    // 390 px: a página não rola de lado (a tabela rola dentro do cartão).
    await page.setViewportSize({ width: 390, height: 844 });
    const semRolagemLateral = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(semRolagemLateral, "a tela do Padronizar rola de lado em 390 px").toBe(true);
    await testInfo.attach("padronizar-390", { body: await page.screenshot(), contentType: "image/png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await testInfo.attach("padronizar-1280", { body: await page.screenshot(), contentType: "image/png" });

    // O que o servidor DEVE enfileirar, derivado das APIs que a tela também lê.
    const { grupos: estados } = await lerJson<{ grupos: Estado[] }>(page, `/api/campanhas/${slug}/grupos/estados`);
    const { conflitos } = await lerJson<{ conflitos: Array<{ whatsappGroupId: string }> }>(
      page,
      "/api/campanhas/conflitos",
    );
    const emConflito = new Set(conflitos.map((c) => c.whatsappGroupId));
    const renomesEsperados = depois.filter((jid, i) => {
      const estado = estados.find((e) => e.whatsappGroupId === jid);
      return Boolean(estado?.isAdmin) && !emConflito.has(jid) && estado?.nome !== `${base} ${i + 1}`;
    }).length;

    // O texto do botão é "Salvar a ordem" (sem renomes) ou "Renomear N … e salvar a ordem".
    await page.getByRole("button", { name: /salvar a ordem/i }).click();
    await expect(page.getByTestId("padronizar-status")).toContainText("Ordem salva");

    const salva = (await lerJson<Campanha[]>(page, "/api/campanhas")).find((c) => c.id === campanha.id);
    expect(salva?.groupIds, "a ordem gravada não é a que a tela mostrava").toEqual(depois);
    expect(salva?.growTemplate?.subjectPattern).toBe(`${base} {n}`);
    expect(typeof salva?.growTemplate?.padronizadoEm).toBe("string");

    const lote = await lerJson<{ total: number; actions: string[] } | null>(page, `/api/campanhas/${slug}/grupos/lotes`);
    if (renomesEsperados === 0) {
      // Nenhum grupo administrado: nada a renomear, e nenhum lote inventado.
      expect(lote?.total ?? 0).toBe(0);
    } else {
      expect(lote?.total).toBe(renomesEsperados);
      expect(lote?.actions).toEqual(["set_subject"]);
    }
  } finally {
    await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
