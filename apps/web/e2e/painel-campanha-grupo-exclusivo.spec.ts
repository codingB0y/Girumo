import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Um grupo, uma campanha (spec 2026-10-10-postar-por-grupo §6.6, D4).
 *
 * Conflito NOVO não dá para fabricar — o trigger `campaign_groups_grupo_exclusivo` recusa. Então:
 * - o que é dado de verdade (seletor travado, 409 do POST e do PATCH) usa campanhas descartáveis
 *   criadas aqui e apagadas no fim, contra um grupo que JÁ está em alguma campanha da loja de QA
 *   (derivado de /api/campanhas e /api/groups, como painel-campanha-acoes-em-massa.spec.ts);
 * - a tela de conflitos e a faixa amarela leem `/api/campanhas/conflitos` interceptado
 *   (`page.route`), como painel-funis.spec.ts.
 * Os dois primeiros só passam com a migração 20261017130000_grupo_uma_campanha aplicada no banco de dev.
 */

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };
type Grupo = { id: string };

exigeCredenciais();

/** Um grupo que já está em alguma campanha e aparece no seletor, com as campanhas que o têm. */
async function grupoEmCampanha(page: Page): Promise<{ jid: string; donas: Campanha[] } | null> {
  const resCampanhas = await page.request.get("/api/campanhas");
  expect(resCampanhas.ok(), `GET /api/campanhas respondeu ${resCampanhas.status()}`).toBeTruthy();
  const campanhas = (await resCampanhas.json()) as Campanha[];
  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const noSeletor = new Set(((await resGrupos.json()) as Grupo[]).map((g) => g.id));

  for (const c of campanhas) {
    const jid = c.groupIds.find((g) => noSeletor.has(g));
    if (jid) return { jid, donas: campanhas.filter((x) => x.groupIds.includes(jid)) };
  }
  return null;
}

function criarCampanha(page: Page, nome: string, groupIds: string[] = []): Promise<APIResponse> {
  return page.request.post("/api/campanhas", {
    data: { name: `${nome} ${Date.now().toString(36)}`, groupIds },
  });
}

async function conferir409(res: APIResponse, jid: string, donas: Campanha[]) {
  expect(
    res.status(),
    "409 esperado — a migração 20261017130000_grupo_uma_campanha está aplicada no banco de dev?",
  ).toBe(409);
  const corpo = (await res.json()) as { error: string; grupo: string; campanha: { id: string; name: string } };
  expect(corpo.grupo).toBe(jid);
  const dona = donas.find((c) => c.id === corpo.campanha.id);
  expect(dona, `a campanha ${corpo.campanha.id} do 409 não tem o grupo ${jid}`).toBeTruthy();
  expect(corpo.campanha.name).toBe(dona?.name);
  expect(corpo.error).toContain(`“${dona?.name}”`);
}

test("o seletor trava o grupo que já está em outra campanha, com o nome dela", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const alvo = await grupoEmCampanha(page);
  test.skip(!alvo, "Nenhum grupo em campanha neste ambiente.");
  if (!alvo) return;

  const criada = await criarCampanha(page, "E2E seletor exclusivo");
  expect(criada.status(), `POST /api/campanhas respondeu ${criada.status()}`).toBe(201);
  const campanha = (await criada.json()) as Campanha;
  try {
    await page.goto(`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`);
    await page.getByRole("button", { name: "Grupos", exact: true }).click();

    const opcao = page.getByTestId(`grupo-opcao-${alvo.jid}`);
    await expect(opcao).toBeDisabled();
    const texto = (await opcao.textContent()) ?? "";
    expect(
      alvo.donas.some((c) => texto.includes(`já está em ${c.name}`)),
      `"${texto}" não diz em qual campanha o grupo está`,
    ).toBeTruthy();
  } finally {
    await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
  }

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("POST e PATCH com grupo de outra campanha respondem 409 no formato do contrato", async ({ page }) => {
  const alvo = await grupoEmCampanha(page);
  test.skip(!alvo, "Nenhum grupo em campanha neste ambiente.");
  if (!alvo) return;

  const apagar: string[] = [];
  try {
    // POST: a campanha nem nasce. (Sem o trigger ela nasceria — por isso o `apagar`.)
    const post = await criarCampanha(page, "E2E exclusivo post", [alvo.jid]);
    if (post.status() === 201) apagar.push(((await post.json()) as Campanha).id);
    await conferir409(post, alvo.jid, alvo.donas);

    // PATCH: campanha vazia tentando pegar o grupo.
    const vazia = await criarCampanha(page, "E2E exclusivo patch");
    expect(vazia.status(), `POST /api/campanhas respondeu ${vazia.status()}`).toBe(201);
    const campanha = (await vazia.json()) as Campanha;
    apagar.push(campanha.id);
    const patch = await page.request.patch("/api/campanhas", {
      data: { id: campanha.id, groupIds: [alvo.jid] },
    });
    await conferir409(patch, alvo.jid, alvo.donas);
  } finally {
    for (const id of apagar) await page.request.delete(`/api/campanhas?id=${encodeURIComponent(id)}`);
  }
});

const MODA = { id: "11111111-1111-4111-8111-111111111111", name: "Moda Kids do Sul", slug: "moda-kids-e2e" };
const SALDAO = { id: "22222222-2222-4222-8222-222222222222", name: "Saldão Outubro", slug: "saldao-e2e" };

test("a tela de conflitos só salva com todas as escolhas e manda uma por grupo", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const conflitos = [
    {
      whatsappGroupId: "e2e-vip@g.us",
      nome: "Grupo VIP Kids",
      campanhas: [{ ...MODA, posicao: 5 }, { ...SALDAO, posicao: 2 }],
    },
    {
      whatsappGroupId: "e2e-novo@g.us",
      nome: "Novo grupo",
      campanhas: [{ ...MODA, posicao: 14 }, { ...SALDAO, posicao: 4 }],
    },
  ];
  let enviados: Array<{ jid: string; ficaEm: string }> = [];
  await page.route("**/api/campanhas/conflitos", (rota) => {
    if (rota.request().method() === "POST") {
      enviados = [...enviados, rota.request().postDataJSON() as { jid: string; ficaEm: string }];
      return rota.fulfill({ json: { ok: true } });
    }
    return rota.fulfill({ json: { conflitos: enviados.length === conflitos.length ? [] : conflitos } });
  });

  await page.goto(`/painel/campanhas/conflitos?de=${MODA.slug}`);
  await expect(page.getByRole("heading", { name: "2 grupos estão em duas campanhas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Moda Kids do Sul" })).toHaveAttribute(
    "href",
    `/painel/campanhas/${MODA.slug}`,
  );

  const salvar = page.getByRole("button", { name: "Salvar escolhas" });
  await expect(salvar).toBeDisabled();
  await expect(page.getByText("Falta escolher 2 grupos.")).toBeVisible();

  await page.getByRole("group", { name: /Grupo VIP Kids/ }).getByRole("radio", { name: /Saldão Outubro/ }).check();
  await expect(page.getByText("Falta escolher 1 grupo.")).toBeVisible();
  await expect(salvar).toBeDisabled();

  await page.getByRole("group", { name: /Novo grupo/ }).getByRole("radio", { name: /Moda Kids do Sul/ }).check();
  await expect(page.getByText("Pronto: cada grupo fica em uma campanha só.")).toBeVisible();
  await salvar.click();

  await expect(page.getByRole("heading", { name: "Nenhum grupo está em duas campanhas" })).toBeVisible();
  expect(enviados).toEqual([
    { jid: "e2e-vip@g.us", ficaEm: SALDAO.id },
    { jid: "e2e-novo@g.us", ficaEm: MODA.id },
  ]);
  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

test("a aba Grupos avisa quando grupos desta campanha também estão em outra", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  const campanha = ((await res.json()) as Campanha[]).find((c) => c.slug);
  test.skip(!campanha?.slug, "Nenhuma campanha neste ambiente.");
  if (!campanha?.slug) return;

  const aqui = { id: campanha.id, name: campanha.name, slug: campanha.slug, posicao: 1 };
  const outra = { id: "44444444-4444-4444-8444-444444444444", name: "Outra E2E", slug: "outra-e2e", posicao: 3 };
  await page.route("**/api/campanhas/conflitos", (rota) =>
    rota.fulfill({
      json: {
        conflitos: [
          { whatsappGroupId: "e2e-a@g.us", nome: "Grupo A E2E", campanhas: [aqui, { ...SALDAO, posicao: 2 }] },
          { whatsappGroupId: "e2e-b@g.us", nome: "Grupo B E2E", campanhas: [{ ...SALDAO, posicao: 1 }, aqui] },
          // Não envolve esta campanha: fica fora da conta da faixa.
          { whatsappGroupId: "e2e-c@g.us", nome: "Grupo C E2E", campanhas: [{ ...SALDAO, posicao: 4 }, outra] },
        ],
      },
    }),
  );

  await page.goto(`/painel/campanhas/${campanha.slug}`);
  await page.getByRole("button", { name: "Grupos", exact: true }).click();

  const aviso = page.getByRole("note").filter({ hasText: "desta campanha" });
  await expect(aviso).toContainText("2 grupos desta campanha também estão em Saldão Outubro.");
  await expect(aviso.getByRole("link", { name: "Escolher onde ficam" })).toHaveAttribute(
    "href",
    `/painel/campanhas/conflitos?de=${encodeURIComponent(campanha.slug)}`,
  );
  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
