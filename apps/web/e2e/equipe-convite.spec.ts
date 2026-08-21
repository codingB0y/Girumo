import { expect, test } from "@playwright/test";
import { exigeCredenciais } from "./sessao-helpers";

/**
 * Convidar -> aparece na lista -> revogar -> some.
 *
 * Este e o teste que teria pego o #114: o botao de revogar existia como
 * componente, tinha teste unitario, e nenhuma pagina o importava. Nada disso
 * aparece se a asercao for sobre o componente; so aparece clicando na tela.
 *
 * A entrega do e-mail fica de fora de proposito — depende de caixa externa e
 * deixaria a suite instavel. Desde o #112 a entrega vira linha em public.logs,
 * que se confere por SQL sem browser.
 */
test.describe("convite de equipe", () => {
  exigeCredenciais();

  test("convidar, ver na lista e revogar", async ({ page }) => {
    // Endereco unico por execucao: sem isso a segunda rodada esbarra no convite
    // que a primeira deixou para tras.
    const convidado = `e2e-convite-${Date.now()}@exemplo.invalid`;

    // Sessao vem do auth.setup.ts; aqui so navega.
    await page.goto("/painel/configuracoes");
    await page.getByRole("button", { name: "Equipe", exact: true }).click();

    const campoEmail = page.getByLabel("Email do convidado");
    const botaoConvidar = page.getByRole("button", { name: "Convidar", exact: true });
    await expect(campoEmail).toBeVisible();

    // Esperar a lista chegar antes de digitar. Escrever no campo antes do React
    // hidratar poe o texto no DOM sem por no state: o botao continua disabled e
    // o clique nao faz nada. Foi assim que a primeira versao deste teste falhou
    // com a API respondendo 201 normalmente.
    await expect(
      page.getByText("Ativo").or(page.getByText("Só você por enquanto")).first(),
    ).toBeVisible();

    await campoEmail.fill(convidado);
    await expect(botaoConvidar, "o React nao registrou o e-mail digitado").toBeEnabled();

    // Esperar a RESPOSTA, nao um tempo arbitrario: POST /api/members envia o
    // e-mail de convite de forma sincrona, entao a rota demora mais que o
    // timeout padrao. Com espera por tempo, o teste reprovava um convite que o
    // banco ja tinha gravado.
    const [resposta] = await Promise.all([
      page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/members" && r.request().method() === "POST",
        { timeout: 60_000 },
      ),
      botaoConvidar.click(),
    ]);
    expect(resposta.status(), "POST /api/members nao criou o convite").toBe(201);

    const linhaDoConvidado = page.getByText(convidado, { exact: true });
    await expect(linhaDoConvidado, "convite nao apareceu na lista da equipe").toBeVisible();

    const botaoRevogar = page.getByRole("button", { name: `Revogar convite de ${convidado}` });
    await expect(botaoRevogar, "o botao de revogar nao chegou na tela (regressao do #114)").toBeVisible();

    // A revogacao pede confirmacao via window.confirm; sem aceitar, o dialog
    // fica pendurado e o clique nao completa.
    page.once("dialog", (dialog) => void dialog.accept());
    await botaoRevogar.click();

    await expect(linhaDoConvidado, "convite continuou na lista depois de revogar").toHaveCount(0);
  });
});
