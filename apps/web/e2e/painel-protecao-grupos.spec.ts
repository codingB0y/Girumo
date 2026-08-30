import { expect, test } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * Proteção dos grupos em /painel/conectar (R1 da análise competitiva de 28/08).
 *
 * Mesmo desenho por CONTRASTE do spec irmão (`painel-saude-numero.spec.ts`), e
 * pela mesma razão: o bloco depende de dado que nenhum ambiente garante — em
 * produção os grupos nascem com `admins_counted_at` nulo até o primeiro sync, e
 * o tenant de QA não mantém sessão de WhatsApp de pé. Um spec que cobrasse "2
 * grupos em risco" passaria hoje e quebraria amanhã por dado, não por regresso.
 *
 * A âncora é a própria API: lê /api/groups/protecao e cobra da tela exatamente
 * o que ela respondeu.
 *
 * O QUE ISTO PROTEGE DE VERDADE: o número de pessoas em risco é a única frase
 * do painel que pede uma decisão cara do lojista (promover alguém, ou pagar o
 * segundo celular). Se a tela somasse por conta própria — incluindo grupo que
 * não administramos, ou grupo ainda não contado — estaria pedindo essa decisão
 * com base num número inventado. A rota `/painel/conectar` tem isenção
 * `semLista` em conteudo-esperado.ts, então sem este spec o bloco inteiro
 * poderia morrer sem ninguém notar.
 */

type Protecao = {
  administrados: number;
  medidos: number;
  semBackup: number;
  comBackup: number;
  naoMedidos: number;
  membrosEmRisco: number;
  emRisco: Array<{ id: string; name: string; members: number }>;
};

exigeCredenciais();

test("proteção dos grupos reflete a API, ou some quando não há grupo administrado", async ({
  page,
}) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const res = await page.request.get("/api/groups/protecao");
  expect(res.ok(), `GET /api/groups/protecao respondeu ${res.status()}`).toBeTruthy();
  const protecao = (await res.json()) as Protecao;

  // A tela monta o bloco atrás de "existe número conectado" — a mesma condição
  // do bloco de saúde. Sem cobrar isso aqui, um tenant com grupos administrados
  // e nenhuma sessão de pé faria este spec falhar sem haver defeito nenhum.
  const saude = await page.request.get("/api/instances/health");
  expect(saude.ok(), `GET /api/instances/health respondeu ${saude.status()}`).toBeTruthy();
  const { numbers } = (await saude.json()) as { numbers: Array<{ connected: boolean }> };
  const temNumeroConectado = numbers.some((n) => n.connected);

  await page.goto("/painel/conectar");

  const bloco = page.getByRole("region", { name: "Proteção dos seus grupos" });

  // Sem grupo administrado não é "tudo certo": é que ainda não há ativo a
  // proteger. Afirmar a ausência também pega o bug de mostrar alarme para quem
  // nem pareou o celular.
  if (!temNumeroConectado || protecao.administrados === 0) {
    await expect(bloco).toHaveCount(0);
    await semErroDeRuntime(page);
    expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
    return;
  }

  await expect(bloco).toBeVisible();

  if (protecao.semBackup > 0) {
    // O tamanho do prejuízo em PESSOAS é o número que sustenta o pedido de
    // ação. Ele sai da API; a tela não pode chegar a outro.
    await expect(
      bloco.getByText(protecao.membrosEmRisco.toLocaleString("pt-BR"), { exact: false }),
    ).toBeVisible();

    // Os grupos listados são os que a API classificou — não uma seleção da tela.
    for (const grupo of protecao.emRisco.slice(0, 3)) {
      await expect(bloco.getByText(grupo.name, { exact: false }).first()).toBeVisible();
    }

    // As duas saídas, na ordem honesta: a de graça resolve o problema inteiro e
    // vem antes da paga. Inverter isso transforma um aviso de risco em anúncio.
    //
    // A ordem cobrada é a do DOM, não a coordenada na tela: em `sm` os dois
    // cartões ficam LADO A LADO, com o mesmo `y`, e uma comparação de altura
    // passaria nos dois sentidos — foi o que deixou um mutante de inversão
    // sobreviver antes desta versão.
    const saidas = bloco.getByRole("list", { name: "Como resolver" }).getByRole("listitem");
    await expect(saidas).toHaveCount(2);
    await expect(saidas.first()).toContainText("Promova alguém de confiança");
    await expect(saidas.last()).toContainText("Conecte um segundo número");
  } else if (protecao.medidos > 0) {
    // Contamos e está tudo com segundo admin: o bloco confirma, sem inventar
    // urgência.
    await expect(bloco.getByText("mais de um administrador", { exact: false })).toBeVisible();
  } else {
    // Administra grupos mas nenhum foi contado ainda — o estado de produção até
    // o primeiro sync. A tela precisa dizer que não sabe, e não que está tudo bem.
    await expect(bloco.getByText("Ainda não conferimos", { exact: false })).toBeVisible();
  }

  await semErroDeRuntime(page);
  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
