import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { ENTRADA_DEFAULTS, isClosedAt } from "../src/lib/campaigns/settings";
import type { EstadoGrupo } from "../src/lib/groups/estado";
import { coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Grupos da campanha (postar por grupo, PR 4): faixa de estados, chip por grupo, frase do
 * link e o menu ⋯ com Reabrir / Marcar como lotado / Editar capacidade.
 *
 * Dois desenhos, de propósito:
 * - CONTRASTE com a API real: a tela mostra exatamente o que /grupos/estados respondeu. Nenhum
 *   número fixo — o estado de dev muda a cada sync.
 * - API SIMULADA (page.route) para o que o dev não garante: um lotado ainda cheio (o Reabrir
 *   travado com o motivo) e um enchendo reaberto. Simular em vez de mexer em grupo real: o banco
 *   de dev é de todos os PRs ao mesmo tempo, e mudar capacidade ou marca de um grupo de QA mudaria
 *   o destino do link no meio do run de outro PR. O SQL de `podeReabrir` é provado no teste de
 *   integração da store.
 */

type Campanha = {
  id: string;
  slug?: string;
  groupIds: string[];
  settings?: { entrada?: { encerra_em?: string | null } };
};
type Alvo = { slug: string; groupIds: string[]; estados: Estados; encerraEm: string | null };
type Estados = {
  grupos: EstadoGrupo[];
  contagem: { lotado: number; enchendo: number; fila: number; vazio: number; membros: number };
};

type GrupoDaApi = { whatsappGroupId: string; sendState?: "open" | "closed" | null };

const ROTULO: Record<EstadoGrupo["estado"], string> = {
  lotado: "Lotado",
  enchendo: "Enchendo agora",
  fila: "Na fila",
  vazio: "Vazio",
};
/** Texto do `SeloEnvio` (o CSS põe em caixa alta; o texto do DOM é este). */
const SELO = { open: "Aberto", closed: "Fechado", nenhum: "Envio: sem informação" } as const;
const selo = (s: GrupoDaApi["sendState"]) => (s === "open" ? SELO.open : s === "closed" ? SELO.closed : SELO.nenhum);
const numero = (n: number) => n.toLocaleString("pt-BR");

exigeCredenciais();

/** A campanha com mais grupos resolvidos, lida pela mesma rota que a tela usa. */
async function campanhaComEstados(page: Page): Promise<Alvo | null> {
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  let melhor: Alvo | null = null;
  for (const campanha of (await res.json()) as Campanha[]) {
    if (!campanha.slug || campanha.groupIds.length === 0) continue;
    const r = await page.request.get(`/api/campanhas/${encodeURIComponent(campanha.slug)}/grupos/estados`);
    expect(r.ok(), `GET .../grupos/estados de ${campanha.slug} respondeu ${r.status()}`).toBeTruthy();
    const estados = (await r.json()) as Estados;
    if (estados.grupos.length > (melhor?.estados.grupos.length ?? 0)) {
      melhor = {
        slug: campanha.slug,
        groupIds: campanha.groupIds,
        estados,
        encerraEm: campanha.settings?.entrada?.encerra_em ?? null,
      };
    }
  }
  return melhor;
}

async function abrirAbaGrupos(page: Page, slug: string) {
  await page.goto(`/painel/campanhas/${slug}`);
  await page.getByRole("button", { name: "Grupos", exact: true }).click();
  // "Grupos da campanha" também nomeia uma seção da Visão geral; a faixa só existe nesta aba.
  await expect(page.getByRole("region", { name: "Resumo dos grupos" })).toBeVisible();
}

test("a faixa e o chip de cada grupo mostram o que /grupos/estados respondeu", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  const alvo = await campanhaComEstados(page);
  test.skip(!alvo, "Nenhuma campanha com grupos neste ambiente.");
  if (!alvo) return;
  const { slug, estados } = alvo;

  // O selo de envio por grupo continua vindo de /api/groups, como no cartão antigo.
  const resGrupos = await page.request.get("/api/groups");
  expect(resGrupos.ok(), `GET /api/groups respondeu ${resGrupos.status()}`).toBeTruthy();
  const envio = new Map(((await resGrupos.json()) as GrupoDaApi[]).map((g) => [g.whatsappGroupId, g.sendState]));

  await abrirAbaGrupos(page, slug);

  const resumo = page.getByRole("region", { name: "Resumo dos grupos" });
  await expect(resumo.getByTestId("resumo-lotados")).toHaveText(numero(estados.contagem.lotado));
  await expect(resumo.getByTestId("resumo-enchendo")).toHaveText(numero(estados.contagem.enchendo));
  await expect(resumo.getByTestId("resumo-fila")).toHaveText(numero(estados.contagem.fila));
  await expect(resumo.getByTestId("resumo-vazios")).toHaveText(numero(estados.contagem.vazio));
  await expect(resumo.getByTestId("resumo-membros")).toHaveText(numero(estados.contagem.membros));

  const lista = page.getByRole("region", { name: "Grupos da campanha" });
  await expect(lista.getByRole("listitem")).toHaveCount(estados.grupos.length);
  for (const g of estados.grupos) {
    const linha = lista.locator(`li[data-group-id="${g.groupId}"]`);
    await expect(linha.getByTestId("chip-estado")).toHaveText(ROTULO[g.estado]);
    // Nulo ou ausente é "sem informação", nunca "Aberto" (o motivo de o SeloEnvio existir).
    await expect(linha.getByTestId("selo-envio")).toHaveText(selo(envio.get(g.whatsappGroupId)));
  }
  // No máximo um "Enchendo agora" (spec §3), e o botão da linha só nele.
  await expect(lista.getByRole("button", { name: "Marcar como lotado" })).toHaveCount(estados.contagem.enchendo);

  // Grupo do pool sem linha em `groups` não volta do SQL: a aba diz quantos faltam.
  const faltam = new Set(alvo.groupIds).size - estados.grupos.length;
  if (faltam > 0) {
    await expect(page.getByTestId("fora-da-lista")).toContainText(
      `${numero(faltam)} ${faltam === 1 ? "grupo" : "grupos"} desta campanha`,
    );
  } else {
    await expect(page.getByTestId("fora-da-lista")).toHaveCount(0);
  }

  // Uma fonte só: as duas abas decidem "parado × mandando gente" pelo mesmo `destinoDoLink` (o do
  // /r/). Mandando, o mesmo grupo — nome exato, "Grupo 1" não pode passar por "Grupo 10". Parado
  // (sem enchendo, ou campanha encerrada com um enchendo no banco), as mesmas palavras.
  const enchendo = estados.grupos.find((g) => g.estado === "enchendo");
  const frase = page.getByTestId("frase-do-link");
  if (enchendo && !isClosedAt(alvo.encerraEm, new Date())) {
    await expect(frase.locator("strong").first()).toHaveText(enchendo.nome);
    await page.getByRole("button", { name: "Link e cliques", exact: true }).click();
    await expect(page.getByTestId("destino-do-link").locator("strong")).toHaveText(enchendo.nome);
  } else {
    await expect(frase).not.toContainText("mandando gente");
    const parado = (await frase.textContent()) ?? "";
    await page.getByRole("button", { name: "Link e cliques", exact: true }).click();
    await expect(page.getByTestId("destino-do-link")).toHaveText(parado);
  }

  // A camada HTTP do POST /grupos/lotado (auth, campanha, escopo do grupo), sem escrever nada:
  // as duas recusas saem antes do RPC. `page.request` usa a sessão do login e fica fora do
  // ouvinte de rede da página; de todo modo, 4xx nunca entra em `coletarFalhasDeApi` (só 5xx).
  const lotado = `/api/campanhas/${encodeURIComponent(slug)}/grupos/lotado`;
  const deOutraCampanha = await page.request.post(lotado, { data: { groupId: randomUUID(), acao: "marcar" } });
  expect(deOutraCampanha.status(), "grupo que não é desta campanha").toBe(404);
  expect(await deOutraCampanha.json()).toEqual({ error: "Grupo não encontrado nesta campanha." });
  const acaoInvalida = await page.request.post(lotado, { data: { groupId: randomUUID(), acao: "xyz" } });
  expect(acaoInvalida.status(), "acao fora de marcar/reabrir").toBe(400);
  expect(await acaoInvalida.json()).toEqual({ error: 'acao deve ser "marcar" ou "reabrir".' });

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});

// ---------------------------------------------------------------- API simulada

const DIA_MS = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString();
const TODAS = { menos_enchendo: true, lotados: true, com_gente: true };

function grupo(p: Pick<EstadoGrupo, "posicao" | "estado" | "membros"> & Partial<EstadoGrupo>): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-0000000e2e0${p.posicao}`,
    whatsappGroupId: `e2e-estado-${p.posicao}@g.us`,
    nome: `E2E estado ${p.posicao}`,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/E2EESTADO${p.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: { menos_enchendo: false, lotados: false, com_gente: false },
    ...p,
  };
}

const CHEIO = grupo({ posicao: 1, estado: "lotado", membros: 1003, lotadoEm: atras(4), lotadoPor: "auto", naRegra: TODAS });
const COM_VAGA = grupo({
  posicao: 2,
  estado: "lotado",
  membros: 812,
  lotadoEm: atras(2),
  lotadoPor: "manual",
  podeReabrir: true,
  naRegra: TODAS,
});
const ENCHENDO = grupo({
  posicao: 3,
  estado: "enchendo",
  membros: 958,
  reabertoEm: atras(1),
  naRegra: { menos_enchendo: false, lotados: false, com_gente: true },
});
const FILA = grupo({
  posicao: 4,
  estado: "fila",
  membros: 412,
  naRegra: { menos_enchendo: true, lotados: false, com_gente: true },
});
const VAZIO = grupo({ posicao: 5, estado: "vazio", membros: 1 });
const SEM_CONVITE = grupo({
  posicao: 6,
  estado: "fila",
  membros: 20,
  inviteUrl: null,
  naRegra: { menos_enchendo: true, lotados: false, com_gente: true },
});
const RESPOSTA = {
  grupos: [CHEIO, COM_VAGA, ENCHENDO, FILA, VAZIO, SEM_CONVITE],
  contagem: { lotado: 2, enchendo: 1, fila: 2, vazio: 1, membros: 3206 },
  regras: { menos_enchendo: 4, lotados: 2, com_gente: 5 },
};

/**
 * Os grupos simulados não existem em /api/groups: a lista real volta inteira e ganha o
 * `sendState` de dois deles, para o selo ter Aberto, Fechado e "sem informação" na mesma tela.
 */
const ENVIO_SIMULADO = [
  { whatsappGroupId: CHEIO.whatsappGroupId, sendState: "closed" },
  { whatsappGroupId: COM_VAGA.whatsappGroupId, sendState: "open" },
].map((g) => ({
  ...g,
  id: g.whatsappGroupId,
  name: g.whatsappGroupId,
  members: 0,
  capacity: 1024,
  selected: false,
  engagement: "medio",
  isAdmin: true,
}));

test("Reabrir fica travado com o motivo, o menu é acessível e as ações mandam o contrato das rotas", async ({
  page,
}, testInfo) => {
  const falhasDeApi = coletarFalhasDeApi(page);
  // A aba só monta a lista com grupo resolvido em /api/groups: precisa de uma campanha real.
  const alvo = await campanhaComEstados(page);
  test.skip(!alvo, "Nenhuma campanha com grupos neste ambiente.");
  if (!alvo) return;
  const base = `**/api/campanhas/${encodeURIComponent(alvo.slug)}/grupos`;

  // A data de encerramento também é simulada: aberta, e no fim encerrada. A data real da
  // campanha de dev não pode decidir o que a frase do link diz.
  let encerraEm: string | null = null;
  await page.route("**/api/campanhas", async (rota) => {
    if (rota.request().method() !== "GET") return rota.continue();
    const real = await rota.fetch();
    const lista = (await real.json()) as Campanha[];
    const comData = lista.map((c) =>
      c.slug === alvo.slug
        ? { ...c, settings: { ...c.settings, entrada: { ...ENTRADA_DEFAULTS, ...c.settings?.entrada, encerra_em: encerraEm } } }
        : c,
    );
    return rota.fulfill({ response: real, json: comData });
  });

  let leituras = 0;
  const acoes: unknown[] = [];
  const patches: unknown[] = [];
  await page.route(`${base}/estados`, (rota) => {
    leituras += 1;
    return rota.fulfill({ json: RESPOSTA });
  });
  await page.route(`${base}/lotado`, (rota) => {
    acoes.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/groups", async (rota) => {
    const metodo = rota.request().method();
    if (metodo === "PATCH") {
      patches.push(rota.request().postDataJSON());
      return rota.fulfill({ json: {} });
    }
    if (metodo !== "GET") return rota.continue();
    const real = await rota.fetch();
    const lista = (await real.json()) as unknown[];
    return rota.fulfill({ response: real, json: [...lista, ...ENVIO_SIMULADO] });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await abrirAbaGrupos(page, alvo.slug);
  const lista = page.getByRole("region", { name: "Grupos da campanha" });
  const linha = (g: EstadoGrupo) => lista.locator(`li[data-group-id="${g.groupId}"]`);
  const gatilho = (g: EstadoGrupo) => linha(g).getByRole("button", { name: `Ações do grupo ${g.nome}` });
  const reabrir = (g: EstadoGrupo) => linha(g).getByRole("button", { name: "Reabrir para receber gente" });

  // Frase do link e detalhes que só existem com um reaberto enchendo.
  await expect(page.getByTestId("frase-do-link")).toHaveText(
    "O link está mandando gente para E2E estado 3 — reaberto ontem, tem prioridade. Quando ele lotar, volta para o 4.",
  );
  await expect(linha(CHEIO)).toContainText("Lotou há 4 dias · automático");
  await expect(linha(COM_VAGA)).toContainText("Lotou há 2 dias · marcado à mão");
  await expect(linha(ENCHENDO)).toContainText("Reaberto ontem · prioridade no link");
  await expect(linha(FILA)).toContainText("Pausado: volta a encher quando o 3 lotar");
  await expect(linha(VAZIO)).toContainText("Só o nosso número");
  await expect(linha(SEM_CONVITE)).toContainText("Sem convite: o link pula este grupo");
  await expect(linha(ENCHENDO).getByTestId("chip-estado")).toHaveText("Enchendo agora");

  // O selo de envio do cartão antigo continua por grupo, com os três estados.
  await expect(linha(CHEIO).getByTestId("selo-envio")).toHaveText("Fechado");
  await expect(linha(COM_VAGA).getByTestId("selo-envio")).toHaveText("Aberto");
  await expect(linha(ENCHENDO).getByTestId("selo-envio")).toHaveText("Envio: sem informação");

  // Lotado ainda cheio: Reabrir travado, com o motivo do mockup.
  await gatilho(CHEIO).click();
  await expect(gatilho(CHEIO)).toHaveAttribute("aria-expanded", "true");
  await expect(reabrir(CHEIO)).toBeDisabled();
  await expect(
    linha(CHEIO).getByText(
      "Ainda está com 1.003 de 1.024 (98%). O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.",
    ),
  ).toBeVisible();

  // Copiar convite: o CopyLink do cartão antigo, no ⋯. Copia o convite e o menu fica aberto (o ✓ aparece ali).
  const convite = linha(CHEIO).getByTestId("copiar-convite");
  await expect(convite).toContainText("Copiar convite");
  await expect(convite).toContainText(CHEIO.inviteUrl!);
  await convite.getByRole("button", { name: "Copiar link" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(CHEIO.inviteUrl);
  await expect(gatilho(CHEIO)).toHaveAttribute("aria-expanded", "true");

  // Review Focus 5: Esc fecha e devolve o foco ao ⋯.
  await page.keyboard.press("Escape");
  await expect(reabrir(CHEIO)).toHaveCount(0);
  await expect(gatilho(CHEIO)).toBeFocused();

  // Review Focus 5: um menu por vez; clique fora fecha. A ordem importa: o painel do ⋯ abre PARA
  // BAIXO na mesma coluna de todas as linhas, então o painel da linha de cima cobriria o ⋯ da
  // de baixo e o clique ficaria preso em "intercepts pointer events". Abre a de baixo (COM_VAGA,
  // posição 2) e depois a de cima (CHEIO, posição 1): o painel de baixo não cobre o ⋯ de cima.
  await gatilho(COM_VAGA).click();
  await gatilho(CHEIO).click();
  await expect(lista.locator('button[aria-expanded="true"]')).toHaveCount(1);
  await expect(gatilho(CHEIO)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("region", { name: "Resumo dos grupos" }).click();
  await expect(lista.locator('button[aria-expanded="true"]')).toHaveCount(0);

  // Lotado com vaga: Reabrir liberado, manda o contrato da rota e relê os estados.
  await gatilho(COM_VAGA).click();
  await expect(linha(COM_VAGA)).toContainText("Lota de novo sozinho em 973.");
  const lidasAntes = leituras;
  await reabrir(COM_VAGA).click();
  await expect.poll(() => acoes).toEqual([{ groupId: COM_VAGA.groupId, acao: "reabrir" }]);
  await expect.poll(() => leituras).toBeGreaterThan(lidasAntes);

  // O enchendo tem o botão na própria linha.
  await linha(ENCHENDO).getByRole("button", { name: "Marcar como lotado" }).click();
  await expect.poll(() => acoes.length).toBe(2);
  expect(acoes[1]).toEqual({ groupId: ENCHENDO.groupId, acao: "marcar" });

  // Review Focus 2: Editar capacidade usa o PATCH que já existe, pelo JID e sem apagar o convite.
  await gatilho(FILA).click();
  await linha(FILA).getByRole("button", { name: "Editar capacidade" }).click();
  await linha(FILA).getByLabel("Capacidade").fill("500");
  await linha(FILA).getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(() => patches)
    .toEqual([{ id: FILA.whatsappGroupId, inviteUrl: FILA.inviteUrl, capacity: 500 }]);

  // Sem convite: o item diz o mesmo que o cartão dizia, e não há o que copiar.
  await gatilho(SEM_CONVITE).click();
  const semConvite = linha(SEM_CONVITE).getByTestId("copiar-convite");
  await expect(semConvite).toContainText("Configure o link de convite");
  await expect(semConvite.getByRole("button", { name: "Copiar link" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Prova visual: 1280 e 390, sem nada da aba passando da borda no celular.
  await page.setViewportSize({ width: 1280, height: 900 });
  await testInfo.attach("estados-grupos-1280", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const nome of ["Resumo dos grupos", "Grupos da campanha"]) {
    const caixa = await page.getByRole("region", { name: nome }).boundingBox();
    expect(caixa, `região ${nome} sem caixa`).not.toBeNull();
    expect(caixa!.x + caixa!.width, `${nome} passa da borda em 390`).toBeLessThanOrEqual(391);
  }
  await testInfo.attach("estados-grupos-390", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  // A aba Link e cliques lê a MESMA rota (aqui, a simulada): o destino é o reaberto que enche,
  // não o primeiro com vaga da sequência antiga (withSequentialEstado escolheria outro).
  await page.getByRole("button", { name: "Link e cliques", exact: true }).click();
  await expect(page.getByTestId("destino-do-link").locator("strong")).toHaveText(ENCHENDO.nome);

  // Campanha encerrada com o 3 ainda "enchendo" no banco: o /r/ bloqueia com `closed`, e as duas
  // abas dizem que o link parou, com as mesmas palavras.
  encerraEm = "2026-01-01";
  await abrirAbaGrupos(page, alvo.slug);
  await expect(page.getByTestId("frase-do-link")).toHaveText(
    /^A campanha passou da data de encerramento: quem clicar agora /,
  );
  const parado = (await page.getByTestId("frase-do-link").textContent()) ?? "";
  await page.getByRole("button", { name: "Link e cliques", exact: true }).click();
  await expect(page.getByTestId("destino-do-link")).toHaveText(parado);

  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
