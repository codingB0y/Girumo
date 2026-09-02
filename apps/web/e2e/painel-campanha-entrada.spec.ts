import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Entrada das configurações da campanha.
 *
 * Contraste API × tela: o spec grava pela TELA, lê pela API e cobra que os
 * chips do cabeçalho digam exatamente o que o servidor devolveu. Número ou
 * valor fixo aqui passaria hoje e quebraria amanhã por dado.
 *
 * A campanha é criada e apagada pelo próprio spec (a API tem DELETE), com nome
 * único — uma esquecida por execução anterior não se confunde com esta.
 */

type Entrada = {
  deep_link: boolean;
  um_grupo_por_pessoa: boolean;
  encerra_em: string | null;
  lotado: { modo: "aviso" } | { modo: "pagina"; pagina_slug: string } | { modo: "url"; url: string };
};
type Campanha = { id: string; slug?: string; settings?: { entrada: Entrada } };

test.use({ storageState: ESTADO_LOGADO });

const URL_DESTINO = "https://exemplo.girumo.com.br/lista-de-espera";

/** Espelho deliberado de `chipLabels` — se o app mudar o rótulo, o spec tem de acusar. */
function chipsEsperados(e: Entrada): string[] {
  const lotado = e.lotado.modo === "aviso" ? "aviso" : e.lotado.modo === "pagina" ? "lista de espera" : "outro link";
  const chips = [
    `Deep link · ${e.deep_link ? "ligado" : "desligado"}`,
    `1 grupo por pessoa · ${e.um_grupo_por_pessoa ? "ligado" : "desligado"}`,
    `Lotado · ${lotado}`,
  ];
  if (e.encerra_em) {
    const [, m, d] = e.encerra_em.split("-");
    chips.splice(2, 0, `Encerra em ${d}/${m}`);
  }
  return chips;
}

test.describe("configurações de entrada da campanha", () => {
  exigeCredenciais();

  test("salva pela tela, persiste no servidor e os chips refletem", async ({ page }) => {
    const falhasDeApi = coletarFalhasDeApi(page);
    const nome = `E2E entrada ${Date.now().toString(36)}`;
    const criada = await page.request.post("/api/campanhas", { data: { name: nome } });
    expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}`).toBeTruthy();
    const campanha = (await criada.json()) as Campanha;
    const chave = campanha.slug ?? campanha.id;

    try {
      await page.goto(`/painel/campanhas/${chave}/editar?aba=entrada`);

      const deepLink = page.getByRole("switch", { name: "Abrir direto no aplicativo do WhatsApp" });
      await expect(deepLink).toHaveAttribute("aria-checked", "true");
      await deepLink.click();
      await expect(deepLink).toHaveAttribute("aria-checked", "false");

      await page.getByRole("radio", { name: "Mandar para outro link" }).check();
      const destino = page.getByLabel("Link de destino");
      await destino.fill("http://inseguro.com");
      await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
      await destino.fill(URL_DESTINO);
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await page.waitForURL(new RegExp(`/painel/campanhas/${chave}$`));

      // Âncora: o que o servidor gravou.
      const lista = await page.request.get("/api/campanhas");
      expect(lista.ok()).toBeTruthy();
      const salva = ((await lista.json()) as Campanha[]).find((c) => c.id === campanha.id);
      expect(salva?.settings?.entrada).toBeTruthy();
      const entrada = salva!.settings!.entrada;
      expect(entrada.deep_link).toBe(false);
      expect(entrada.lotado).toEqual({ modo: "url", url: URL_DESTINO });

      // Contraste: a tela, depois de recarregar, diz o mesmo que a API.
      await page.reload();
      const chips = page.getByRole("list", { name: "Configurações de entrada" });
      for (const rotulo of chipsEsperados(entrada)) {
        await expect(chips.getByRole("link", { name: rotulo, exact: true })).toBeVisible();
      }

      expect(falhasDeApi, "nenhuma chamada de API pode ter falhado").toEqual([]);
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });
});
