import { expect, test, type Page } from "@playwright/test";
import { exigeCredenciais } from "./sessao-helpers";
import { confirmarNaFolha } from "./confirmacao";

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

/**
 * Rede de seguranca do `finally`: convite que sobra no tenant de dev ocupa vaga
 * do plano em todo run seguinte. Procura pelo e-mail (unico por execucao), e nao
 * pelo id da resposta, porque o teste pode cair entre o 201 e a leitura do id.
 * So apaga convite pendente com aquele e-mail — nunca outro membro da loja QA.
 * Falha aqui vira anotacao, nao erro: erro no `finally` esconderia a falha real.
 */
async function apagarConviteQueSobrou(page: Page, email: string) {
  try {
    const res = await page.request.get("/api/members");
    if (!res.ok()) throw new Error(`GET /api/members ${res.status()}`);
    const membros = (await res.json()) as Array<{ id: string; invited_email: string | null; accepted_at: string | null }>;
    for (const m of membros) {
      if (m.invited_email?.toLowerCase() !== email || m.accepted_at) continue;
      await page.request.delete(`/api/members?id=${encodeURIComponent(m.id)}`);
    }
  } catch (e) {
    test.info().annotations.push({ type: "limpeza do convite falhou", description: `${email}: ${String(e)}` });
  }
}

test.describe("convite de equipe", () => {
  exigeCredenciais();

  test("convidar, ver na lista e revogar", async ({ page }) => {
    // Endereco unico por execucao: sem isso a segunda rodada esbarra no convite
    // que a primeira deixou para tras.
    const convidado = `e2e-convite-${Date.now()}@exemplo.invalid`;

    // Sessao vem do auth.setup.ts; aqui so navega.
    await page.goto("/painel/configuracoes");
    // Sem `exact`: na Vitrine a porta carrega o resumo embaixo do rótulo, então
    // o nome acessível vira "Equipe 2 pessoas" assim que a consulta responde —
    // com `exact: true` o teste virava corrida com o fetch.
    await page.getByRole("button", { name: /^Equipe/ }).first().click();

    const equipe = page.getByTestId("configuracoes-equipe");
    const campoEmail = equipe.getByLabel("E-mail", { exact: true });
    const botaoConvidar = equipe.getByRole("button", { name: "Enviar convite", exact: true });
    await expect(campoEmail).toBeVisible();

    // Esperar a lista chegar antes de digitar. Escrever no campo antes do React
    // hidratar poe o texto no DOM sem por no state: o botao continua disabled e
    // o clique nao faz nada. Foi assim que a primeira versao deste teste falhou
    // com a API respondendo 201 normalmente.
    // "Ativo" é da casca antiga; a Vitrine mostra o papel em português ("Dono",
    // "Administração"), porque "owner"/"operator" não podem chegar à tela. O
    // teste vale nas duas até a casca antiga sair.
    await expect(
      page
        .getByText("Ativo")
        .or(page.getByText("Dono"))
        .or(page.getByText("Só você por enquanto"))
        .first(),
    ).toBeVisible();

    try {
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

      // A revogacao pergunta antes de agir; sem responder a folha, nada acontece.
      await botaoRevogar.click();
      await confirmarNaFolha(page, "Revogar");

      await expect(linhaDoConvidado, "convite continuou na lista depois de revogar").toHaveCount(0);
    } finally {
      await apagarConviteQueSobrou(page, convidado);
    }
  });

  /**
   * Acesso da vendedora, PR 6: o dono escolhe a função no convite e liga os
   * módulos dela; depois troca pelo "Editar acesso" sem refazer o convite. A
   * vendedora entrando e vendo só Vendas é do PR 5 (precisa de um segundo login).
   */
  test("convidar vendedora com Postar, ver os chips, tirar o Postar e revogar", async ({ page }) => {
    const convidada = `e2e-vendedora-${Date.now()}@exemplo.invalid`;

    await page.goto("/painel/configuracoes");
    await page.getByRole("button", { name: /^Equipe/ }).first().click();

    const equipe = page.getByTestId("configuracoes-equipe");
    const campoEmail = equipe.getByLabel("E-mail", { exact: true });
    const botaoEnviar = equipe.getByRole("button", { name: "Enviar convite", exact: true });
    await expect(equipe.getByText("Dono").or(equipe.getByText("Só você por enquanto")).first()).toBeVisible();

    try {
      await campoEmail.fill(convidada);
      await expect(botaoEnviar, "o React nao registrou o e-mail digitado").toBeEnabled();

      await equipe.getByRole("radio", { name: "Vendedora", exact: true }).check();
      const acesso = equipe.getByRole("group", { name: "O que ela pode acessar" });
      const vendas = acesso.getByRole("checkbox", { name: "Registrar vendas", exact: true });
      await expect(vendas).toBeChecked();
      await expect(vendas, "Registrar vendas é da vendedora sempre").toBeDisabled();
      await acesso.getByRole("checkbox", { name: "Postar nos grupos", exact: true }).check();

      const [resposta] = await Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/members" && r.request().method() === "POST",
          { timeout: 60_000 },
        ),
        botaoEnviar.click(),
      ]);
      expect(resposta.status(), "POST /api/members nao criou o convite").toBe(201);
      expect(resposta.request().postDataJSON()).toEqual({ email: convidada, role: "seller", modules: ["postar"] });
      const conviteId = ((await resposta.json()) as { id: string }).id;

      const linha = equipe.getByRole("listitem").filter({ hasText: convidada });
      await expect(linha).toContainText("Vendedora");
      const chips = linha.getByRole("list", { name: "Acesso liberado" }).getByRole("listitem");
      await expect(chips).toHaveText(["Registrar vendas", "Postar nos grupos"]);
      await expect(equipe, "o identificador do banco não chega à tela").not.toContainText("seller");

      const editar = linha.getByRole("button", { name: `Editar acesso de ${convidada}` });
      await expect(editar).toHaveAttribute("aria-expanded", "false");
      await editar.click();
      await expect(linha.getByRole("button", { name: `Fechar acesso de ${convidada}` })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const painel = linha.getByRole("group", { name: `O que ${convidada} pode acessar` });
      await painel.getByRole("checkbox", { name: "Postar nos grupos", exact: true }).uncheck();

      const [patch] = await Promise.all([
        page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/members" && r.request().method() === "PATCH",
        ),
        linha.getByRole("button", { name: "Salvar acesso", exact: true }).click(),
      ]);
      expect(patch.status(), "PATCH /api/members nao salvou o acesso").toBe(200);
      expect(await patch.json()).toEqual({ id: conviteId, modules: [] });
      await expect(chips).toHaveText(["Registrar vendas"]);
      await expect(painel, "o painel fecha depois de salvar").toBeHidden();

      await linha.getByRole("button", { name: `Revogar convite de ${convidada}` }).click();
      await confirmarNaFolha(page, "Revogar");
      await expect(equipe.getByText(convidada, { exact: true })).toHaveCount(0);
    } finally {
      await apagarConviteQueSobrou(page, convidada);
    }
  });
});
