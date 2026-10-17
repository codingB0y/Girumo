import { expect, test, type Page, type Route } from "@playwright/test";

import { exigeCredenciais } from "./sessao-helpers";

/**
 * Carga que falha não pode virar "não existe" (C43, auditoria de 16/10/2026).
 *
 * Antes, `fetch(...).then(r => r.json()).catch(() => [])` transformava 401 de
 * sessão expirada, 5xx e rede caída numa lista vazia: "Campanha não encontrada",
 * "Ninguém entrou ainda" e o formulário de edição com o nome em branco.
 *
 * A rota é derrubada com page.route (500, sem tocar no banco de dev): a tela tem
 * que avisar e oferecer "Tentar de novo". Depois a rota volta e o botão vai à
 * rede — aí aparece o estado real. O slug não existe de propósito: com a rota de
 * volta, a tela cai em "Campanha não encontrada", o que prova que erro e não-achou
 * são cenas diferentes e que o botão buscou de novo.
 */

exigeCredenciais();

const INEXISTENTE = "campanha-que-nao-existe-e2e";
const foraDoAr = (rota: Route) => rota.fulfill({ status: 500, json: { error: "boom" } });

function alerta(page: Page, titulo: string) {
  return page.getByRole("alert").filter({ hasText: titulo });
}

test("detalhe da campanha: falha vira Tentar de novo, nunca 'Campanha não encontrada'", async ({ page }) => {
  await page.route("**/api/campanhas", foraDoAr);
  await page.goto(`/painel/campanhas/${INEXISTENTE}`, { waitUntil: "load" });

  const aviso = alerta(page, "Não deu para carregar esta campanha.");
  await expect(aviso).toBeVisible();
  await expect(page.getByText("Campanha não encontrada.")).toHaveCount(0);

  await page.unroute("**/api/campanhas", foraDoAr);
  await aviso.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText("Campanha não encontrada.")).toBeVisible();
});

test("editar campanha: falha não abre o formulário em branco", async ({ page }) => {
  await page.route("**/api/campanhas", foraDoAr);
  await page.goto(`/painel/campanhas/${INEXISTENTE}/editar`, { waitUntil: "load" });

  const aviso = alerta(page, "Não deu para carregar esta campanha.");
  await expect(aviso).toBeVisible();
  // Nenhum campo: salvar um formulário que não leu a campanha seria escrever às cegas.
  await expect(page.locator("main input")).toHaveCount(0);

  await page.unroute("**/api/campanhas", foraDoAr);
  await aviso.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText("Campanha não encontrada.")).toBeVisible();
  await expect(page.locator("main input")).toHaveCount(0);
});

test("contatos: falha vira Tentar de novo, nunca 'Ninguém entrou ainda'", async ({ page }) => {
  // A lista é paginada (`/api/leads?offset=…`): o glob "**/api/leads" não casa
  // com query string, então a rota casa pelo caminho. A contagem
  // (`/api/leads/contagem`) fica de fora — quem falha aqui é a lista.
  const lista = (url: URL) => url.pathname === "/api/leads";
  await page.route(lista, foraDoAr);
  await page.goto("/painel/contatos", { waitUntil: "load" });

  const aviso = alerta(page, "Não deu para carregar seus contatos.");
  await expect(aviso).toBeVisible();
  await expect(page.getByText("Ninguém entrou ainda")).toHaveCount(0);
  await expect(page.getByTestId("contatos-lista")).toHaveCount(0);

  await page.unroute(lista, foraDoAr);
  await aviso.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByTestId("contatos-lista")).toBeVisible();
});
