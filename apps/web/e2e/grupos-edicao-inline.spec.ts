import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, exigeCredenciais } from "./sessao-helpers";

/**
 * Edição inline de convite e capacidade em /painel/grupos.
 *
 * Existe porque `PATCH /api/groups` ficou sem chamador desde sempre: era por
 * isso que os 194 grupos de produção estavam sem `invite_url` e o link mestre
 * da campanha não mandava ninguém para lugar nenhum. O `GroupSettings` é o fio
 * que faltava, e este spec é o que impede o fio de arrebentar de novo sem
 * ninguém notar — um componente pode continuar montado e mesmo assim parar de
 * salvar.
 *
 * O que o teste cobra, além de "a tela abre":
 *  - o valor volta do SERVIDOR depois do recarregamento, não do estado local;
 *  - o painel recusa convite que não seja do WhatsApp, em vez de gravar um
 *    destino quebrado no funil;
 *  - o valor original é restaurado no fim, para a suite poder rodar de novo.
 */

test.use({ storageState: ESTADO_LOGADO });

const ROTA = "/painel/grupos";

/** Convite de teste — domínio real do WhatsApp, código que não existe. */
const CONVITE_TESTE = "https://chat.whatsapp.com/E2EedicaoInline01";

test.describe("edição inline de convite e capacidade", () => {
  exigeCredenciais();

  test("salva o convite e o valor persiste depois de recarregar", async ({ page }) => {
    await page.goto(ROTA);

    // O rótulo do botão muda conforme o grupo já tem convite ou não — os dois
    // abrem o mesmo formulário.
    const abrir = page.getByRole("button", { name: /Configurar|Adicionar convite/ }).first();
    await expect(abrir, "nenhum grupo na lista: o tenant de QA precisa ter grupo").toBeVisible();
    await abrir.click();

    const campoConvite = page.getByPlaceholder("https://chat.whatsapp.com/…");
    await expect(campoConvite).toBeVisible();
    const original = await campoConvite.inputValue();

    await campoConvite.fill(CONVITE_TESTE);
    await page.getByRole("button", { name: "Salvar" }).click();

    // O formulário fecha sozinho no sucesso (onSaved → onClose).
    await expect(campoConvite).toBeHidden({ timeout: 15_000 });

    // Recarrega: só assim o valor lido vem do banco, e não do estado do React.
    // Sem este passo o teste passaria mesmo se o PATCH não gravasse nada.
    await page.reload();
    await page.getByRole("button", { name: /Configurar|Adicionar convite/ }).first().click();
    await expect(page.getByPlaceholder("https://chat.whatsapp.com/…")).toHaveValue(CONVITE_TESTE);

    // Restaura, para a suite ser repetível.
    await page.getByPlaceholder("https://chat.whatsapp.com/…").fill(original);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByPlaceholder("https://chat.whatsapp.com/…")).toBeHidden({ timeout: 15_000 });
  });

  test("recusa convite que não é do WhatsApp e mostra o motivo", async ({ page }) => {
    // O convite é o destino do /r/<campanha>. Um host alheio aceito aqui não
    // quebra o painel — quebra do outro lado, e só aparece como funil furado.
    await page.goto(ROTA);
    await page.getByRole("button", { name: /Configurar|Adicionar convite/ }).first().click();

    const campoConvite = page.getByPlaceholder("https://chat.whatsapp.com/…");
    await campoConvite.fill("https://exemplo-invalido.test/ABC123");
    await page.getByRole("button", { name: "Salvar" }).click();

    // Cobra a MENSAGEM do servidor, não um `role=alert` qualquer: a página tem
    // outros elementos com esse papel (o banner de dev, por exemplo), e um
    // seletor genérico aqui passava mesmo quando o convite nem era enviado —
    // teste verde medindo a coisa errada.
    await expect(page.getByText(/Convite inválido/i)).toBeVisible({ timeout: 15_000 });
    // E o formulário continua aberto, com o valor recusado à vista para correção.
    await expect(campoConvite).toBeVisible();
    await expect(campoConvite).toHaveValue("https://exemplo-invalido.test/ABC123");
  });
});
