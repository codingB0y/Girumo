import { expect, test } from "@playwright/test";
import { confirmarNaFolha } from "./confirmacao";

/**
 * A casa do número na Vitrine Aberta. Só vale com a flag ligada — desligada, a
 * tela antiga está no ar e este arquivo pula inteiro.
 *
 * O que ele guarda é a cena de ERRO, que foi onde o defeito morava. O gate de
 * plano (402) devolve motivo e NENHUMA instância: `setError`/`setUpgradeUrl`
 * são chamados, `setInstance` não. Enquanto "ainda não respondeu" e "respondeu
 * que falhou" foram uma cena só — desenhada como esqueleto — esse caminho
 * virava duas barras cinzas para sempre, e a mensagem e o botão "Ver planos"
 * nunca chegavam à lojista, presa no passo 2 do onboarding sem nada em que
 * clicar.
 *
 * Os testes puros de `lib/painel/conectar.ts` cobrem a DECISÃO; este cobre o
 * desenho dela. A resposta é fabricada por `page.route` porque nem o CI nem a
 * máquina local alcançam a Evolution, e forçar um 402 de verdade exigiria
 * mexer no plano do tenant de teste.
 */

const MOTIVO = "Seu plano nao permite mais um numero conectado.";
const FALHA = "Nao foi possivel provisionar a instancia no provedor.";

const CONECTADA = {
  id: "inst-e2e",
  name: "WhatsApp",
  phone: "556298191314",
  status: "connected",
  qr_code: null,
  connected_at: "2026-06-02T12:00:00Z",
  updated_at: new Date().toISOString(),
  metadata: null,
};

test.describe("Conectar na Vitrine Aberta", () => {

  test("gate de plano mostra o motivo e uma saida, nunca um esqueleto eterno", async ({ page }) => {
    // O caminho real do 402: a lista vem VAZIA (200) e é a CRIAÇÃO que o gate
    // barra. É por isso que `instancia` fica null com `erro` preenchido — e era
    // exatamente essa combinação que a tela desenhava como esqueleto.
    await page.route("**/api/instances", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        body: JSON.stringify({ error: MOTIVO, upgradeUrl: "/painel/configuracoes" }),
      });
    });

    await page.goto("/painel/conectar", { waitUntil: "load" });

    // Sem instância, a criação espera a declaração do perfil do número.
    await page.getByRole("radio", { name: /Uso este número há mais de 30 dias/ }).click();
    await page.getByRole("button", { name: "Gerar QR code", exact: true }).click();

    // O motivo chega à tela, num `role="alert"` — não escondido num skeleton.
    await expect(page.getByRole("alert").filter({ hasText: MOTIVO })).toBeVisible({
      timeout: 30_000,
    });
    // A saída que o gate precisa oferecer.
    await expect(page.getByRole("button", { name: "Ver planos", exact: true })).toBeVisible();

    // E há por onde sair sem comprar: reconsultar e voltar.
    await expect(page.getByRole("button", { name: /Atualizar|Verificando/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Voltar ao painel/ })).toBeVisible();

    // O esqueleto É o defeito: se ele está na tela, a cena de erro não chegou.
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0);
  });

  test("sessao aberta mostra o cartao do numero com a etiqueta, nao um badge", async ({ page }) => {
    await page.route("**/api/instances", async (route) => {
      if (route.request().method() !== "GET") return route.abort();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([CONECTADA]),
      });
    });
    // A tela importa os grupos ao ver a sessão aberta; sem Evolution isso é 502.
    await page.route("**/api/groups/sync", (route) => route.fulfill({ status: 200, body: "{}" }));

    await page.goto("/painel/conectar", { waitUntil: "load" });

    await expect(page.getByRole("heading", { name: "Seu número" })).toBeVisible({
      timeout: 30_000,
    });
    // O formato do cartão, não o dígito cru que a Evolution grava.
    await expect(page.getByTestId("conectar-cartao")).toContainText("+55 62 9819");
    await expect(page.getByTestId("conectar-etiqueta")).toHaveText("Conectado");
    // A saída existe: até 31/08/2026 a ação vivia na API sem nenhuma tela chamá-la.
    await expect(page.getByRole("button", { name: "Desconectar", exact: true })).toBeVisible();
  });

  test("desconectar pergunta antes e so derruba a sessao com o sim", async ({ page }) => {
    // Um toque derrubava o WhatsApp: o logout tira o aparelho dos "Aparelhos
    // conectados" e só volta repareando com o celular do número.
    await page.route("**/api/instances", async (route) => {
      if (route.request().method() !== "GET") return route.abort();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([CONECTADA]),
      });
    });
    await page.route("**/api/groups/sync", (route) => route.fulfill({ status: 200, body: "{}" }));
    const acoes: unknown[] = [];
    await page.route("**/api/instances/*/actions", async (route) => {
      acoes.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...CONECTADA, status: "disconnected" }),
      });
    });

    await page.goto("/painel/conectar", { waitUntil: "load" });
    const desconectar = page.getByRole("button", { name: "Desconectar", exact: true });
    await expect(desconectar).toBeVisible({ timeout: 30_000 });

    // O toque só abre a pergunta: nenhuma ação sai ainda.
    await desconectar.click();
    const folha = page.getByTestId("painel-confirmacao");
    await expect(folha).toBeVisible();
    await expect(folha).toContainText("Desconectar este número?");
    expect(acoes).toHaveLength(0);

    // Cancelar fecha a pergunta e não derruba nada.
    await folha.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(folha).toHaveCount(0);
    expect(acoes).toHaveLength(0);

    // Com o sim, sai exatamente uma ação de desconectar.
    await desconectar.click();
    await confirmarNaFolha(page, "Desconectar");
    await expect.poll(() => acoes.length).toBe(1);
    expect(acoes[0]).toEqual({ action: "disconnect" });
  });

  test("falha ao criar o numero nao trava a tela: Atualizar tenta de novo", async ({ page }) => {
    // A trava da criação nunca voltava a `false`: depois de um 502 todo
    // "Atualizar" e todo ciclo do polling eram no-op, e só o F5 saía.
    let posts = 0;
    let criada = false;
    const pareando = { ...CONECTADA, phone: null, status: "qr", connected_at: null };
    await page.route("**/api/instances", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(criada ? [pareando] : []),
        });
      }
      posts += 1;
      if (posts === 1) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: FALHA }),
        });
      }
      criada = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(pareando),
      });
    });
    // O QR é pedido à Evolution, que nem o CI nem a máquina local alcançam.
    await page.route("**/api/instances/*/actions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pareando) }),
    );

    await page.goto("/painel/conectar", { waitUntil: "load" });
    await page.getByRole("radio", { name: /Uso este número há mais de 30 dias/ }).click();
    await page.getByRole("button", { name: "Gerar QR code", exact: true }).click();

    const alerta = page.getByRole("alert").filter({ hasText: FALHA });
    await expect(alerta).toBeVisible({ timeout: 30_000 });

    // O polling também tenta de novo (com backoff); qualquer das duas vias
    // basta. O botão fica no cabeçalho de toda cena, então o clique não depende
    // de qual delas está na tela.
    await page
      .getByTestId("conectar-cabecalho")
      .getByRole("button", { name: /Atualizar|Verificando/ })
      .click();

    await expect.poll(() => posts, { timeout: 30_000 }).toBe(2);
    await expect(alerta).toHaveCount(0);
  });
});
