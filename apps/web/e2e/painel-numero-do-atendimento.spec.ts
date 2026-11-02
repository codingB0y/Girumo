import { expect, test, type Page } from "@playwright/test";
import type { CartaoDoNumero, NumeroNaTela } from "../src/lib/privado/cartao";
import { confirmarNaFolha } from "./confirmacao";

/**
 * O cartão do número do atendimento na página Conectar (Recuperar PR 2b).
 *
 * `GET /api/privado/numero` é fabricado por `page.route`: nem o CI nem a máquina local alcançam a
 * Evolution, e o tenant de teste não tem o add-on do Recuperar nem do Rastreio. O que este arquivo
 * guarda é o desenho de cada cena e o contrato com a tela: nome acessível da região, texto da
 * recusa e a pergunta antes de desconectar. Telefones inventados (repo público).
 */

// O número dos grupos, que a página já mostra; o do atendimento é outro chip.
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

const ATENDIMENTO: NumeroNaTela = {
  id: "inst-p",
  name: "Atendimento",
  status: "connected",
  phone: null,
  qr_code: null,
  connected_at: "2026-10-01T12:00:00Z",
  metadata: null,
  pausadoAte: null,
};

/** Os dois `page.route` do número dos grupos: a lista de instâncias e a importação dos grupos. */
async function gruposConectado(page: Page) {
  await page.route("**/api/instances", async (route) => {
    if (route.request().method() !== "GET") return route.abort();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([CONECTADA]) });
  });
  // A tela importa os grupos ao ver a sessão aberta; sem Evolution isso é 502.
  await page.route("**/api/groups/sync", (route) => route.fulfill({ status: 200, body: "{}" }));
}

/** A resposta de `GET /api/privado/numero`. */
async function cartao(page: Page, corpo: CartaoDoNumero) {
  await page.route("**/api/privado/numero", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(corpo) }),
  );
}

test.describe("Número do atendimento na página Conectar", () => {
  test("sem o Recuperar e sem o Rastreio o cartão não aparece", async ({ page }) => {
    await gruposConectado(page);
    await cartao(page, { liberado: false, numero: null });

    const respondeu = page.waitForResponse("**/api/privado/numero");
    await page.goto("/painel/conectar", { waitUntil: "load" });
    // A página dos grupos carregou e o cartão já recebeu a resposta: ausência de verdade, não de pressa.
    await expect(page.getByRole("heading", { name: "Seu número" })).toBeVisible({ timeout: 30_000 });
    await respondeu;

    await expect(page.getByRole("region", { name: "Número do atendimento" })).toHaveCount(0);
  });

  test("com o add-on e sem número, o dono vê o convite para conectar", async ({ page }) => {
    await gruposConectado(page);
    await cartao(page, { liberado: true, numero: null });

    await page.goto("/painel/conectar", { waitUntil: "load" });
    const regiao = page.getByRole("region", { name: "Número do atendimento" });
    await expect(regiao.getByRole("button", { name: "Conectar o número do atendimento" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("chip dos grupos recusado: o cartão explica e oferece outro chip", async ({ page }) => {
    await gruposConectado(page);
    await cartao(page, {
      liberado: true,
      numero: {
        ...ATENDIMENTO,
        status: "disconnected",
        metadata: { privado_recusado: "numero_dos_grupos" },
      },
    });

    await page.goto("/painel/conectar", { waitUntil: "load" });
    const regiao = page.getByRole("region", { name: "Número do atendimento" });
    await expect(regiao).toContainText("Esse chip é o mesmo do número dos grupos", { timeout: 30_000 });
    await expect(regiao.getByRole("button", { name: "Conectar outro chip" })).toBeVisible();
    await expect(regiao.getByRole("button", { name: "Conectar de novo" })).toHaveCount(0);
  });

  test("conectado: telefone formatado, e desconectar pergunta antes", async ({ page }) => {
    await gruposConectado(page); // os dois page.route do número dos grupos
    await cartao(page, { liberado: true, numero: { ...ATENDIMENTO, status: "connected", phone: "556298887777" } });
    const acoes: unknown[] = [];
    await page.route("**/api/instances/inst-p/actions", async (route) => {
      acoes.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/painel/conectar", { waitUntil: "load" });
    const regiao = page.getByRole("region", { name: "Número do atendimento" });
    await expect(regiao).toContainText("+55 62 9888•7777", { timeout: 30_000 });

    await regiao.getByRole("button", { name: "Desconectar o número do atendimento" }).click();
    expect(acoes).toHaveLength(0); // o toque só abre a pergunta
    await confirmarNaFolha(page, "Desconectar");
    await expect.poll(() => acoes.length).toBe(1);
    expect(acoes[0]).toEqual({ action: "disconnect" });
  });
});
