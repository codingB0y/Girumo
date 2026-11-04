import { expect, test } from "@playwright/test";

import { confirmarNaFolha } from "./confirmacao";
import { exigeCredenciais } from "./sessao-helpers";
import type { LinhaDeEntrega, RespostaDeEntregas } from "../src/lib/rastreio/entregas";

/**
 * Vendas › Entregas. A lista e o reenvio são simulados (page.route): nada toca o banco, a
 * Yampi ou o WhatsApp. O que se mede é a tela: filtro e busca viajam no corpo do POST, e o
 * documento digitado nunca aparece numa URL.
 */
test.beforeEach(() => exigeCredenciais());

const DOCUMENTO = "11144477735";
const ID_PROBLEMA = "0b0e6d0a-6f6b-4c53-9a39-1d6a2a3b0001";

const LINHA_PROBLEMA: LinhaDeEntrega = {
  id: ID_PROBLEMA, numero: "1541", primeiroNome: "Ana", etapa: "problema", etapaAt: "2026-11-01T15:00:00.000Z",
  semCodigoHaDias: null, trackingCode: "BR123456789", avisos: [{ texto: "WhatsApp enviado", falhou: false }],
  link: "https://exemplo.test/rastreio/1541", telefone: "5511987654321", podeReenviar: true,
};
const LINHA_ENVIADO: LinhaDeEntrega = {
  id: "0b0e6d0a-6f6b-4c53-9a39-1d6a2a3b0002", numero: "1532", primeiroNome: "Bia", etapa: "enviado",
  etapaAt: "2026-11-01T12:00:00.000Z", semCodigoHaDias: null, trackingCode: "BR987654321", avisos: [],
  link: null, telefone: null, podeReenviar: false,
};

function resposta(filtro: RespostaDeEntregas["filtro"], linhas: LinhaDeEntrega[]): RespostaDeEntregas {
  return {
    numeros: {
      todos: 2, aCaminho: 1, semCodigo: 0, problema: 2, whatsappFalhou: 0, entreguesEm7Dias: 0,
      avisosHoje: { whatsapp: 1, email: 0 },
    },
    filtro, pagina: 1, porPagina: 25, total: linhas.length, linhas, atualizadoEm: "2026-11-02T12:00:00.000Z",
  };
}

test("lista, filtra, busca sem pôr o documento na URL e reenvia o aviso", async ({ page }) => {
  const corpos: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  let reenvios = 0;

  page.on("request", (r) => urls.push(r.url()));
  await page.route("**/api/rastreio/status", (rota) => rota.fulfill({ json: { enabled: true } }));
  await page.route("**/api/rastreio/entregas", async (rota) => {
    const corpo = rota.request().postDataJSON() as Record<string, unknown>;
    corpos.push(corpo);
    const linhas = corpo.filtro === "problema" || corpo.busca ? [LINHA_PROBLEMA] : [LINHA_PROBLEMA, LINHA_ENVIADO];
    await rota.fulfill({ json: resposta(corpo.filtro as RespostaDeEntregas["filtro"], linhas) });
  });
  await page.route("**/api/rastreio/entregas/*/reenviar", async (rota) => {
    reenvios++;
    await rota.fulfill({ json: { reabertos: 1, canais: ["whatsapp"] } });
  });

  await page.goto("/painel/vendas/entregas", { waitUntil: "load" });

  // (a) as linhas aparecem e o filtro viaja no corpo do POST
  await expect(page.getByText("#1541")).toBeVisible();
  await expect(page.getByText("#1532")).toBeVisible();
  await page.getByRole("button", { name: "Problema · 2" }).click();
  await expect(page.getByText("#1532")).toHaveCount(0);
  expect(corpos.some((c) => c.filtro === "problema")).toBe(true);

  // (b) a busca vai no corpo; nenhuma URL requisitada carrega o documento
  await page.getByRole("searchbox", { name: "Buscar pedido" }).fill(DOCUMENTO);
  await expect.poll(() => corpos.some((c) => c.busca === DOCUMENTO)).toBe(true);
  expect(urls.filter((u) => u.includes(DOCUMENTO))).toEqual([]);

  // (c) reenviar: confirma na folha e a rota é chamada
  await page.getByRole("button", { name: "Reenviar aviso" }).click();
  await confirmarNaFolha(page, "Reenviar");
  await expect.poll(() => reenvios).toBe(1);
  await expect(page.getByText("Aviso reenviado. Sai em até 5 minutos.")).toBeVisible();
});
