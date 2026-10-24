import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * "Aviso ao lotar" nas configurações da campanha (spec 2026-10-10 D10, §6.8).
 *
 * Contraste API × tela, como o spec da aba Entrada: grava pela TELA, lê pela API e
 * cobra as transições do `desde` que a rota aplica (lib/campaigns/aviso-ao-lotar.ts):
 * ligar grava, trocar o texto mantém, desligar zera, religar começa um `desde` novo.
 * Um `desde` que andasse na edição pularia quem lotou entre o desde antigo e a edição.
 *
 * A campanha é criada e apagada pelo próprio spec, com nome único.
 */

type Campanha = { id: string; slug?: string; avisoAoLotar?: string | null; avisoAoLotarDesde?: string | null };

test.use({ storageState: ESTADO_LOGADO });

const TEXTO = "Grupo lotado! Amanhã às 9h tem novidade.";
const TEXTO_NOVO = "Lotou! Amanhã às 9h começam as novidades.";
const TEXTO_RELIGADO = "Lotamos de novo! Fique de olho amanhã às 9h.";

test.describe("aviso ao lotar da campanha", () => {
  exigeCredenciais();

  test("liga, troca o texto, desliga e religa pela tela; o servidor guarda o desde certo", async ({ page }, testInfo) => {
    const falhasDeApi = coletarFalhasDeApi(page);
    const nome = `E2E aviso ${Date.now().toString(36)}`;
    const criada = await page.request.post("/api/campanhas", { data: { name: nome } });
    expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}`).toBeTruthy();
    const campanha = (await criada.json()) as Campanha;
    const chave = campanha.slug ?? campanha.id;

    const caixa = page.getByRole("checkbox", { name: "Mandar uma mensagem quando um grupo lotar" });
    const mensagem = page.getByLabel("Mensagem", { exact: true });

    async function abrirAbaGrupos() {
      await page.goto(`/painel/campanhas/${chave}/editar`);
      // Espera a carga da campanha ANTES de mexer na aba: o `setAviso` do carregar() roda no mesmo
      // callback que preenche o título, e uma carga tardia desmarcaria a caixa que o teste acabou de marcar.
      await expect(page.getByPlaceholder("Nome da campanha…")).toHaveValue(nome);
      await page.getByRole("button", { name: "Grupos", exact: true }).click();
    }

    async function salvar() {
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await page.waitForURL(new RegExp(`/painel/campanhas/${chave}$`));
    }

    async function noServidor(): Promise<Campanha> {
      const lista = await page.request.get("/api/campanhas");
      expect(lista.ok()).toBeTruthy();
      const achada = ((await lista.json()) as Campanha[]).find((c) => c.id === campanha.id);
      expect(achada, "a campanha do spec sumiu de GET /api/campanhas").toBeTruthy();
      return achada!;
    }

    try {
      // Ligar: o texto vai aparado e o desde nasce.
      await abrirAbaGrupos();
      await expect(caixa).not.toBeChecked();
      await caixa.check();
      await mensagem.fill(`  ${TEXTO}  `);
      await salvar();
      const ligada = await noServidor();
      expect(ligada.avisoAoLotar).toBe(TEXTO);
      expect(ligada.avisoAoLotarDesde).toBeTruthy();

      // A tela recarregada diz o mesmo que a API, e a lista de avisos aparece, vazia.
      await abrirAbaGrupos();
      await expect(caixa).toBeChecked();
      await expect(mensagem).toHaveValue(TEXTO);
      await expect(page.getByRole("heading", { name: "Últimos avisos" })).toBeVisible();
      await expect(page.getByText("Nenhum aviso ainda.")).toBeVisible();
      await testInfo.attach("aviso-1280", {
        body: await page.getByRole("region", { name: "Aviso ao lotar" }).screenshot(),
        contentType: "image/png",
      });

      // Trocar o texto: o desde fica.
      await mensagem.fill(TEXTO_NOVO);
      await salvar();
      const editada = await noServidor();
      expect(editada.avisoAoLotar).toBe(TEXTO_NOVO);
      expect(editada.avisoAoLotarDesde).toBe(ligada.avisoAoLotarDesde);

      // Desligar: os dois zeram.
      await abrirAbaGrupos();
      await caixa.uncheck();
      await salvar();
      const desligada = await noServidor();
      expect(desligada.avisoAoLotar).toBeNull();
      expect(desligada.avisoAoLotarDesde).toBeNull();

      // Religar começa do zero: um desde NOVO (e posterior), não o antigo ressuscitado.
      await abrirAbaGrupos();
      await expect(caixa).not.toBeChecked();
      await caixa.check();
      await mensagem.fill(TEXTO_RELIGADO);
      await salvar();
      const religada = await noServidor();
      expect(religada.avisoAoLotar).toBe(TEXTO_RELIGADO);
      expect(religada.avisoAoLotarDesde).toBeTruthy();
      expect(religada.avisoAoLotarDesde).not.toBe(ligada.avisoAoLotarDesde);
      expect(Date.parse(religada.avisoAoLotarDesde!)).toBeGreaterThan(Date.parse(ligada.avisoAoLotarDesde!));

      expect(falhasDeApi, "nenhuma chamada de API pode ter falhado").toEqual([]);
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });
});
