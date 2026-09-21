import { expect, test, type Page } from "@playwright/test";

import { exigeCredenciais } from "./sessao-helpers";

/**
 * Sub-aba Funil. NÃO escreve no banco, de propósito:
 * - o Supabase de dev não tem `instances` (21/09/2026), então todo POST real
 *   de mensagem devolve 409 "WhatsApp desconectado";
 * - e onde houver sessão viva, um POST real poria mensagem na fila de um
 *   número de verdade (mesma razão de painel-vitrine-disparos.spec.ts).
 *
 * O que se cobra é o CONTRATO na fronteira de rede: ordem mensagem→oferta, um
 * funnelRunId só, a oferta ligada ao broadcast da 3ª mensagem, e a Agenda
 * mostrando o chip do funil. O lado banco (rascunho aberto pela
 * promote_due_schedules) foi provado por SQL nos dois bancos no PR #304.
 */

type Campanha = { id: string; slug?: string; groupIds: string[] };
type Chamada = { alvo: "mensagem" | "oferta"; body: Record<string, unknown> };

exigeCredenciais();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Nome acessível do botão da sub-aba: o selo "Novo" entra no nome.
const SUBABA_FUNIL = /^Funil/;
// "Agenda" com ou sem o contador; não pode casar "Agendar".
const SUBABA_AGENDA = /^Agenda\s*\d*$/;
// O botão de confirmar; `/^Agendar/` sozinho casa também a sub-aba "Agendar".
const BOTAO_AGENDAR = /^Agendar \d+ mensage/;

function daquiA(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function campanhaComGrupos(page: Page): Promise<Campanha> {
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  const campanha = ((await res.json()) as Campanha[]).find((c) => c.slug && c.groupIds.length > 0);
  test.skip(!campanha, "o tenant de QA não tem campanha com slug e grupos");
  return campanha as Campanha;
}

/**
 * Intercepta toda escrita; o GET da Agenda devolve o que "foi criado".
 * `falharOferta`: o 1º POST de oferta devolve 400 (os seguintes, 201).
 */
async function simularServidor(page: Page, campanha: Campanha, opts: { falharOferta?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  const agenda: Record<string, unknown>[] = [];
  let n = 0;
  let ofertaFalhou = false;

  // Codificado como o confirmFunnel codifica: um slug que o escape altere não
  // pode escapar do mock e escrever de verdade.
  await page.route(`**/api/campanhas/${encodeURIComponent(campanha.slug as string)}/messages`, async (rota) => {
    const req = rota.request();
    if (req.method() === "GET") return rota.fulfill({ json: agenda });
    if (req.method() !== "POST") return rota.continue();
    const body = req.postDataJSON() as Record<string, unknown>;
    chamadas.push({ alvo: "mensagem", body });
    n += 1;
    const view = {
      id: `00000000-0000-4000-8000-0000000f00${String(n).padStart(2, "0")}`,
      campaignId: campanha.id,
      campaignSlug: campanha.slug,
      type: "text",
      body: body.body,
      groupIds: body.groupIds,
      mentionAll: body.mentionAll,
      scheduledAt: body.scheduledAt,
      recurrence: "none",
      status: "scheduled",
      sent: 0,
      total: 0,
      createdAt: new Date().toISOString(),
      funnelTemplateId: body.funnelTemplateId,
      funnelRunId: body.funnelRunId,
    };
    agenda.push(view);
    return rota.fulfill({ status: 201, json: view });
  });

  await page.route("**/api/relampago/offers", async (rota) => {
    if (rota.request().method() !== "POST") return rota.continue();
    chamadas.push({ alvo: "oferta", body: rota.request().postDataJSON() as Record<string, unknown> });
    if (opts.falharOferta && !ofertaFalhou) {
      ofertaFalhou = true;
      return rota.fulfill({ status: 400, json: { error: "grupo ocupado com outra oferta" } });
    }
    return rota.fulfill({ status: 201, json: { offer: { id: "oferta-e2e", status: "draft" } } });
  });

  await page.route("**/api/settings", async (rota) => {
    if (rota.request().method() !== "PATCH") return rota.continue();
    return rota.fulfill({ json: { storeName: "Loja E2E", niche: "moda infantil" } });
  });

  return { chamadas, agenda };
}

async function abrirFunilDaLive(page: Page, slug: string) {
  await page.goto(`/painel/campanhas/${slug}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Mensagens", exact: true }).click();
  // O GET /api/settings do funil preenche loja/nicho só se o campo ainda estiver
  // vazio. Esperar a resposta antes de digitar tira a corrida com o `fill("")`
  // do 2º teste (a loja salva do tenant voltaria para o campo).
  const perfil = page.waitForResponse(
    (r) => r.url().endsWith("/api/settings") && r.request().method() === "GET",
  );
  await page.getByRole("button", { name: SUBABA_FUNIL }).click();
  await perfil;
  await page.getByRole("button", { name: "Lançamento de live", exact: true }).click();
  await page.getByLabel("Dia e hora da live", { exact: true }).fill(daquiA(10));
  await page.getByLabel("Hora", { exact: true }).fill("20:00");
  await page.getByLabel("Sua loja", { exact: true }).fill("Loja E2E");
  await page.getByLabel("Seu nicho", { exact: true }).fill("moda infantil");
}

/** A 1ª etapa já abre aberta ao escolher o roteiro. */
async function preencherPrevia(page: Page) {
  const previa = page.getByRole("article", { name: "Prévia da grade" });
  await previa.getByLabel("peça", { exact: true }).fill("vestido midi");
  await previa.getByLabel("preço", { exact: true }).fill("R$ 39,90");
  await previa.getByLabel("grade", { exact: true }).fill("P ao GG");
  await previa.getByLabel("quantidade", { exact: true }).fill("120");
}

/** O link da live é o único campo da Live que não herda da prévia. */
async function preencherLinkDaLive(page: Page) {
  const entra = page.getByRole("article", { name: "Entra agora" });
  await entra.getByRole("button", { name: /Entra agora/ }).click();
  await entra.getByLabel("link da live", { exact: true }).fill("https://instagram.com/lojae2e/live");
}

test("Live: 4 mensagens em série, oferta ligada à 3ª, chip na Agenda", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  const { chamadas } = await simularServidor(page, campanha);
  await abrirFunilDaLive(page, campanha.slug as string);

  await preencherPrevia(page);
  await expect(page.getByTestId("funil-previa-previa-da-grade")).toContainText("Amanhã 20h tem live da Loja E2E!");

  await preencherLinkDaLive(page);

  const agendar = page.getByRole("button", { name: /^Agendar 4 mensagens/ });
  await expect(agendar).toBeEnabled();
  await agendar.click();

  // A Agenda é a prova de que a confirmação terminou.
  await expect(page.getByText("Lançamento de live · 4/4")).toBeVisible();
  for (const i of [1, 2, 3]) await expect(page.getByText(`Lançamento de live · ${i}/4`)).toBeVisible();
  await expect(page.getByRole("button", { name: SUBABA_AGENDA })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: SUBABA_FUNIL })).toHaveAttribute("aria-pressed", "false");

  expect(chamadas.map((c) => c.alvo)).toEqual(["mensagem", "mensagem", "mensagem", "oferta", "mensagem"]);
  const mensagens = chamadas.filter((c) => c.alvo === "mensagem").map((c) => c.body);
  const runIds = new Set(mensagens.map((m) => m.funnelRunId));
  expect(runIds.size).toBe(1);
  expect(String([...runIds][0])).toMatch(UUID);
  for (const m of mensagens) {
    expect(m.funnelTemplateId).toBe("live");
    expect(m.recurrence).toBe("none");
    expect(typeof m.scheduledAt).toBe("string");
    expect(String(m.body)).not.toMatch(/\{[^}]+\}/);
    // Campanha com grupos: os alvos são os groupIds dela (disparo pro público certo).
    expect(m.groupIds).toEqual(campanha.groupIds);
  }
  const oferta = chamadas[3].body;
  expect(oferta.broadcastId).toBe("00000000-0000-4000-8000-0000000f0003");
  expect(oferta.slots).toBe(120);
  expect(oferta.keyword).toBe("eu quero");
});

test("sem 'Sua loja' o botão não agenda e diz o que falta", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  const { chamadas } = await simularServidor(page, campanha);
  await abrirFunilDaLive(page, campanha.slug as string);
  // Tudo o mais que a Live pede está preenchido: o botão habilita. Só assim o
  // "desabilita" abaixo prova o gate da loja, e não um campo vazio qualquer.
  await preencherPrevia(page);
  await preencherLinkDaLive(page);
  const agendar = page.getByRole("button", { name: BOTAO_AGENDAR });
  await expect(agendar).toBeEnabled();

  await page.getByLabel("Sua loja", { exact: true }).fill("");
  await expect(agendar).toBeDisabled();
  await expect(page.locator("#funil-motivo")).toContainText("Sua loja");
  expect(chamadas).toHaveLength(0);
});

test("prova visual: sub-aba Funil em 1280 e 390 sem erro de console", async ({ page }, testInfo) => {
  // Nada é filtrado: as rotas interceptadas por `simularServidor` respondem 2xx,
  // então não geram "Failed to load resource". Qualquer erro aqui é real — a URL
  // vai junto para o relatório apontar a rota.
  const erros: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on("pageerror", (err) => erros.push(`pageerror: ${err.message}`));

  const campanha = await campanhaComGrupos(page);
  const { chamadas } = await simularServidor(page, campanha);
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirFunilDaLive(page, campanha.slug as string);
  await preencherPrevia(page);
  await expect(page.getByTestId("funil-previa-previa-da-grade")).toContainText("vestido midi");

  await testInfo.attach("funil-1280", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("funil-previa-previa-da-grade")).toBeVisible();
  await testInfo.attach("funil-390", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  // Em vez de só "rola ou não", lista quem passa da borda: a 1ª falha aqui
  // foi o cabeçalho da campanha (URL mestra sem min-w-0), não o funil, e sem
  // o nome do elemento o vermelho não dizia onde olhar.
  const estouros = await page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= largura) return [];
    return [...document.querySelectorAll("body *")]
      .filter((el) => getComputedStyle(el).position !== "fixed" && el.getBoundingClientRect().right > largura + 0.5)
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
  });
  expect(estouros, "a página rola na horizontal em 390 px").toEqual([]);

  expect(chamadas).toHaveLength(0);
  expect(erros).toEqual([]);
});

test("falha na oferta sobrevive à ida até a Agenda e a retomada não duplica mensagem", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  const { chamadas } = await simularServidor(page, campanha, { falharOferta: true });
  await abrirFunilDaLive(page, campanha.slug as string);
  await preencherPrevia(page);
  await preencherLinkDaLive(page);

  await page.getByRole("button", { name: /^Agendar 4 mensagens/ }).click();
  const relatorio = page.getByRole("alert").filter({ hasText: "Parou em “Grade da live”" });
  await expect(relatorio).toBeVisible();
  expect(chamadas.map((c) => c.alvo)).toEqual(["mensagem", "mensagem", "mensagem", "oferta"]);

  // O relatório manda conferir a Agenda; ida e volta não pode zerar o funil.
  await page.getByRole("button", { name: SUBABA_AGENDA }).click();
  await expect(page.getByRole("button", { name: SUBABA_AGENDA })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: SUBABA_FUNIL }).click();
  await expect(relatorio).toBeVisible();

  // Sobram a oferta da 3ª e a mensagem da 4ª: nada das três já agendadas volta.
  const antes = chamadas.length;
  await page.getByRole("button", { name: /^Agendar 2 mensagens/ }).click();
  await expect(page.getByText("Lançamento de live · 4/4")).toBeVisible();

  const retomada = chamadas.slice(antes);
  expect(retomada.map((c) => c.alvo)).toEqual(["oferta", "mensagem"]);
  expect(retomada[0].body.broadcastId).toBe("00000000-0000-4000-8000-0000000f0003");
  const mensagens = chamadas.filter((c) => c.alvo === "mensagem").map((c) => c.body);
  expect(mensagens).toHaveLength(4);
  expect(new Set(mensagens.map((m) => m.scheduledAt)).size).toBe(4);
  expect(new Set(mensagens.map((m) => m.funnelRunId)).size).toBe(1);
});

test("comunidade não tem a sub-aba Funil", async ({ page }) => {
  const res = await page.request.get("/api/comunidades");
  expect(res.ok(), `GET /api/comunidades respondeu ${res.status()}`).toBeTruthy();
  const { comunidades } = (await res.json()) as { comunidades?: { slug?: string }[] };
  const comunidade = (comunidades ?? []).find((c) => c.slug);
  test.skip(!comunidade, "o tenant de QA não tem comunidade");

  await page.goto(`/painel/comunidades/${comunidade?.slug}`, { waitUntil: "load" });
  // Âncora: a aba Mensagens de lá renderizou (sem isso o count 0 passa com a tela vazia).
  await expect(page.getByRole("button", { name: "Enviar agora", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: SUBABA_FUNIL })).toHaveCount(0);
});
