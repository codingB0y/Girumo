import { expect, test } from "@playwright/test";

import { exigeCredenciais } from "./sessao-helpers";
import type { RespostaDaConfig } from "../src/lib/rastreio/config-painel";
import { MATRIZ_PADRAO } from "../src/lib/rastreio/tipos";

/**
 * Configurações › Rastreio de pedidos. Status e config são simulados (page.route): nada toca o
 * banco. O que se mede: um toque no interruptor manda a matriz inteira, com a etapa trocada.
 */
test.beforeEach(() => exigeCredenciais());

const FIXTURE: RespostaDaConfig = {
  config: {
    publicSlug: "loja-exemplo", matrix: MATRIZ_PADRAO, notifyStoreOnProblem: true, vipLinkId: null,
    storeWhatsapp: null, importedAt: "2026-11-01T12:00:00.000Z",
  },
  linkDaBusca: "https://www.girumo.com.br/rastreio/loja-exemplo",
  loja: "Loja Exemplo",
  yampi: "ativa",
  linksDeConvite: [],
};

test("o interruptor manda o PATCH com a matriz inteira", async ({ page }) => {
  const patches: Array<Record<string, unknown>> = [];
  await page.route("**/api/rastreio/status", (rota) => rota.fulfill({ json: { enabled: true } }));
  await page.route("**/api/rastreio/config", async (rota) => {
    if (rota.request().method() === "PATCH") {
      const corpo = rota.request().postDataJSON() as Record<string, unknown>;
      patches.push(corpo);
      await rota.fulfill({ json: { ...FIXTURE, config: { ...FIXTURE.config, ...corpo } } });
      return;
    }
    await rota.fulfill({ json: FIXTURE });
  });

  await page.goto("/painel/configuracoes?secao=rastreio", { waitUntil: "load" });
  const interruptor = page.getByRole("switch", { name: "WhatsApp em Pedido enviado" });
  await expect(interruptor).toHaveAttribute("aria-checked", "true");
  await interruptor.click();

  await expect.poll(() => patches.length).toBe(1);
  const matriz = patches[0].matrix as Record<string, { whatsapp: boolean; email: boolean }>;
  expect(Object.keys(matriz).sort()).toEqual(["confirmado", "entregue", "enviado", "problema", "retirada"]);
  expect(matriz.enviado.whatsapp).toBe(false);
  await expect(interruptor).toHaveAttribute("aria-checked", "false");
});
