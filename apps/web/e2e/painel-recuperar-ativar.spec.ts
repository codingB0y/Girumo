import { expect, test } from "@playwright/test";

import { AVISO_DE_PRIVACIDADE } from "../src/lib/recuperar/aviso";
import { moca, OFERTA_NORMAL, type EstadoMock } from "./recuperar-mocks";
import { exigeCredenciais } from "./sessao-helpers";

/**
 * A porta do Recuperar: oferta para quem não tem o add-on, "falta configurar" para quem
 * pagou. Status e oferta são simulados (page.route): nada toca o banco nem o Stripe.
 */
test.beforeEach(() => exigeCredenciais());

test("sem o add-on: oferta com preço e o que inclui; só deixa ativar depois da confirmação", async ({ page }) => {
  await moca(page, { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "Recupere o carrinho e o Pix que ficaram pra trás" })).toBeVisible();
  await expect(page.getByText("R$ 127,00")).toBeVisible();
  for (const t of ["Pix pendente", "Carrinho abandonado", "Conversas com scripts", "Número do atendimento"]) {
    await expect(page.getByText(t, { exact: true })).toBeVisible();
  }
  const ativar = page.getByRole("button", { name: "Ativar Recuperar" });
  await expect(ativar).toBeDisabled();
  await page.getByLabel(AVISO_DE_PRIVACIDADE.texto).check();
  await expect(ativar).toBeEnabled();
});

test("ao voltar pago, espera o webhook e abre o módulo sozinho", async ({ page }) => {
  const estado = { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL } as EstadoMock;
  await moca(page, estado);
  let corpo: unknown = null;
  let chamadas = 0;
  await page.route("**/api/billing/recuperar/checkout", (rota) => {
    chamadas += 1;
    corpo = rota.request().postDataJSON();
    return rota.fulfill({ json: { url: "/painel/recuperar?assinado=1" } });
  });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await page.getByLabel(AVISO_DE_PRIVACIDADE.texto).check();
  // Clique duplo: tem que abrir uma sessão de pagamento só.
  await page.getByRole("button", { name: "Ativar Recuperar" }).dblclick();
  await expect(page.getByText("Pagamento recebido. Liberando o Recuperar da loja…")).toBeVisible();
  expect(chamadas).toBe(1);
  expect(corpo).toEqual({ avisoConfirmado: true });
  estado.status = { enabled: true, precisaDeVoce: 0 };
  await expect(page.getByText("Liberado para a sua loja. Falta configurar.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Recupere o carrinho e o Pix que ficaram pra trás" })).toHaveCount(0);
});

test("pagamento em aberto: manda para Gerenciar cobrança, não para o toast de já assinado", async ({ page }) => {
  await moca(page, { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  const aberto = "A assinatura do Recuperar está com pagamento em aberto. Regularize em Gerenciar cobrança.";
  await page.route("**/api/billing/recuperar/checkout", (r) =>
    r.fulfill({ status: 409, json: { error: aberto, code: "cobranca_pendente" } }),
  );
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await page.getByLabel(AVISO_DE_PRIVACIDADE.texto).check();
  await page.getByRole("button", { name: "Ativar Recuperar" }).click();
  await expect(page.getByText(aberto)).toBeVisible();
  const gerenciar = page.getByRole("button", { name: "Gerenciar cobrança" });
  await expect(gerenciar).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar Recuperar" })).toHaveCount(0);
  await page.route("**/api/billing/portal", (r) => r.fulfill({ json: { url: "/painel/configuracoes?billing=portal" } }));
  await gerenciar.click();
  await expect(page).toHaveURL(/\/painel\/configuracoes\?billing=portal/);
});

test("já assinado em outra aba: espera o webhook em vez do toast", async ({ page }) => {
  const estado = { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL } as EstadoMock;
  await moca(page, estado);
  await page.route("**/api/billing/recuperar/checkout", (r) =>
    r.fulfill({
      status: 409,
      json: { error: "O Recuperar já está assinado. Pode levar alguns segundos para liberar.", code: "ja_assinado" },
    }),
  );
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await page.getByLabel(AVISO_DE_PRIVACIDADE.texto).check();
  await page.getByRole("button", { name: "Ativar Recuperar" }).click();
  await expect(page.getByText("Pagamento recebido. Liberando o Recuperar da loja…")).toBeVisible();
  estado.status = { enabled: true, precisaDeVoce: 0 };
  await expect(page.getByText("Liberado para a sua loja. Falta configurar.")).toBeVisible({ timeout: 15_000 });
});

test("quem não cobra, sem plano e preço fechado veem o motivo e nenhum botão de ativar", async ({ page }) => {
  const estado = { status: { enabled: false, precisaDeVoce: 0 }, oferta: { ...OFERTA_NORMAL, podeCobrar: false } } as EstadoMock;
  await moca(page, estado);
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByText("Só o dono ou um admin da loja pode ativar.")).toBeVisible();
  estado.oferta = { bloqueio: "sem_plano", configurado: true, podeCobrar: true };
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Assine um plano primeiro. O Recuperar é um add-on do plano da loja.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver os planos" })).toHaveAttribute("href", "/painel/configuracoes");
  estado.oferta = { bloqueio: null, configurado: false, podeCobrar: true };
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Assinatura do Recuperar indisponível no momento. Fale com a Girumo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar Recuperar" })).toHaveCount(0);
});

test("o status falhou: erro com tentar de novo, nunca a oferta; ao voltar, abre o módulo", async ({ page }) => {
  const estado = { status: 500, oferta: OFERTA_NORMAL } as EstadoMock;
  await moca(page, estado);
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByText("Não deu para carregar o Recuperar.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recupere o carrinho/ })).toHaveCount(0);
  estado.status = { enabled: true, precisaDeVoce: 0 };
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText("Liberado para a sua loja. Falta configurar.")).toBeVisible();
});

test("liberado: título, os quatro passos na ordem e nenhuma ação", async ({ page }) => {
  await moca(page, { status: { enabled: true, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "Recuperar" })).toBeVisible();
  const passos = page.getByRole("list", { name: "Passos da configuração" }).getByRole("listitem");
  await expect(passos).toHaveText([
    "Conectar a Yampi",
    "Conectar o número do atendimento",
    "Definir como a loja assina as mensagens",
    "Testar no seu WhatsApp e ligar",
  ]);
  await expect(page.getByRole("button", { name: /Ativar Recuperar|Conectar|Testar no seu WhatsApp/ })).toHaveCount(0);
});
