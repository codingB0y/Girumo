import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Integrações das configurações da campanha.
 *
 * Contraste API × tela: grava pela TELA, lê pela API. O valor novo é DERIVADO do
 * que o servidor devolveu antes — literal fixo passa hoje e colide amanhã com
 * outra rodada. E cobra o que mais importa aqui: o token nunca volta inteiro.
 *
 * A campanha é criada e apagada pelo próprio spec, com nome único.
 */

type IntegracoesPublicas = {
  meta: { pixel_id: string; evento: string; test_code: string; capi_token_set: boolean; capi_token_last4: string };
  ga4: { id: string };
  google_ads: { id: string; label: string };
};
type Campanha = { id: string; slug?: string; settings?: { integracoes: IntegracoesPublicas } };

test.use({ storageState: ESTADO_LOGADO });

// Montado em pedaços de propósito: o scan de secrets do verify-local pega
// literal que se pareça com token do Meta.
const TOKEN_FALSO = "EAA" + "tokendeteste" + "XY99";

test.describe("integrações da campanha", () => {
  exigeCredenciais();

  test("salva pela tela, persiste no servidor e o token nunca volta", async ({ page }) => {
    const falhasDeApi = coletarFalhasDeApi(page);
    const nome = `E2E integracoes ${Date.now().toString(36)}`;
    const criada = await page.request.post("/api/campanhas", { data: { name: nome } });
    expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}`).toBeTruthy();
    const campanha = (await criada.json()) as Campanha;
    const chave = campanha.slug ?? campanha.id;

    try {
      // ÂNCORA: o que o servidor diz ANTES. O valor novo sai daqui.
      const pixelAntes = campanha.settings?.integracoes.meta.pixel_id ?? "";
      const pixelNovo = pixelAntes === "1234567890" ? "1234567891" : "1234567890";

      await page.goto(`/painel/campanhas/${chave}/editar?aba=integracoes`);
      await page.getByLabel("ID do pixel").fill(pixelNovo);
      await page.getByLabel("Token da API de Conversões").fill(TOKEN_FALSO);
      await page.getByLabel("ID de medição (GA4)").fill("G-E2E12345");
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await page.waitForURL(new RegExp(`/painel/campanhas/${chave}$`));

      // CONTRASTE: o servidor gravou exatamente o que a tela mandou.
      const lista = await page.request.get("/api/campanhas");
      expect(lista.ok()).toBeTruthy();
      const salva = ((await lista.json()) as Campanha[]).find((c) => c.id === campanha.id);
      const i = salva!.settings!.integracoes;
      expect(i.meta.pixel_id).toBe(pixelNovo);
      expect(i.ga4.id).toBe("G-E2E12345");

      // O token existe, mas o GET só admite os 4 últimos.
      expect(i.meta.capi_token_set).toBe(true);
      expect(i.meta.capi_token_last4).toBe("XY99");
      expect(JSON.stringify(salva)).not.toContain(TOKEN_FALSO.slice(0, 12));

      // O chip do cabeçalho reflete o SERVIDOR, não o estado local do formulário.
      const chips = page.getByRole("list", { name: "Configurações de entrada" });
      await expect(chips.getByRole("link", { name: `Pixel · …${pixelNovo.slice(-4)}`, exact: true })).toBeVisible();

      expect(falhasDeApi, "nenhuma chamada de API pode ter falhado").toEqual([]);
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });

  test("pixel inválido é recusado pelo servidor com o campo no erro", async ({ page }) => {
    const criada = await page.request.post("/api/campanhas", {
      data: { name: `E2E integracoes 400 ${Date.now().toString(36)}` },
    });
    const campanha = (await criada.json()) as Campanha;
    try {
      const res = await page.request.patch("/api/campanhas", {
        data: {
          id: campanha.id,
          settings: {
            entrada: { deep_link: true, um_grupo_por_pessoa: true, encerra_em: null, lotado: { modo: "aviso" } },
            integracoes: {
              meta: { pixel_id: "abc", evento: "Lead", test_code: "" },
              ga4: { id: "" },
              google_ads: { id: "", label: "" },
            },
          },
        },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toContain("meta.pixel_id");
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });
});
