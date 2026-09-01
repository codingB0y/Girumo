import { expect, test } from "@playwright/test";

import { coletarFalhasDeApi, exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * Saude do numero em /painel/conectar (R2 da analise competitiva de 28/08).
 *
 * POR QUE O TESTE E POR CONTRASTE E NAO POR VALOR FIXO: o bloco so existe
 * quando ha numero CONECTADO, e nenhum ambiente garante isso — dev costuma
 * estar vazio e o tenant de QA nao mantem sessao de WhatsApp de pe. Um spec
 * que exigisse "dia 3 de aquecimento" na tela passaria hoje e quebraria amanha
 * por dado, nao por regresso.
 *
 * Entao a ancora e a propria API: le /api/instances/health e cobra da tela
 * exatamente o que a API respondeu.
 *
 * O GATE E HISTORICO (`everConnected`), NAO SESSAO ABERTA. Ate 31/08/2026 este
 * spec cobrava a ausencia do bloco sempre que nenhum numero estava conectado —
 * codificando um bug: o painel sumia exatamente quando o numero caia ou era
 * bloqueado, que e a unica hora em que o lojista precisa dele. O que o teste
 * protegia de verdade continua protegido aqui: quem criou a instancia e nunca
 * escaneou o QR nao ve rampa de aquecimento nenhuma.
 *
 * O teto do dia sai de `app.instance_daily_cap`, a MESMA funcao que o
 * `claim_send_commands` usa para liberar envio. Se a tela mostrar um numero
 * diferente do que a API devolveu, e porque alguem recalculou a regra no
 * cliente — que e justamente a segunda verdade que este bloco existe pra
 * eliminar.
 */

type NumeroSaude = {
  instanceId: string;
  connected: boolean;
  everConnected: boolean;
  warmupDay: number | null;
  graduated: boolean;
  dailyCap: number;
  usedToday: number;
};

exigeCredenciais();

test("saude do numero reflete a API, e so some para quem nunca pareou", async ({ page }) => {
  const falhasDeApi = coletarFalhasDeApi(page);

  const res = await page.request.get("/api/instances/health");
  expect(res.ok(), `GET /api/instances/health respondeu ${res.status()}`).toBeTruthy();
  const { numbers } = (await res.json()) as { numbers: NumeroSaude[] };
  const comHistorico = numbers.filter((n) => n.everConnected);
  const conectados = comHistorico.filter((n) => n.connected);

  await page.goto("/painel/conectar");

  const bloco = page.getByRole("region", { name: "Saúde do número" });

  if (comHistorico.length === 0) {
    await expect(bloco).toHaveCount(0);
    await semErroDeRuntime(page);
    expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
    return;
  }

  await expect(bloco).toBeVisible();

  // A regra dos 14 dias e material de onboarding: aparece SEMPRE que ha numero
  // com historico, nao so quando ja virou risco. Avisar so no dia 10 chega
  // tarde pra quem podia ter evitado desligando o WhatsApp Web sobrando.
  await expect(page.getByText("Duas regras do WhatsApp que ninguém te conta")).toBeVisible();

  // Numero que ja pareou mas esta fora do ar: o cartao continua na tela, em
  // modo aviso. Teto e aquecimento nao se aplicam sem sessao, entao nao sao
  // cobrados aqui — o que se cobra e que a tela DIGA que esta desconectado, em
  // vez de sumir e deixar o lojista sem explicacao.
  if (conectados.length === 0) {
    await expect(bloco.getByText("Desconectado")).toBeVisible();
    await semErroDeRuntime(page);
    expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
    return;
  }

  const numero = conectados[0];

  // O teto e o uso do dia vem do banco; a tela nao pode inventar outro par.
  await expect(bloco.getByText(`${numero.usedToday} / ${numero.dailyCap}`)).toBeVisible();

  // Aquecimento: quem graduou nao pode aparecer como "dia N" — seria mentira
  // sobre o proprio mecanismo que o bloco existe pra tornar auditavel.
  if (numero.graduated) {
    await expect(bloco.getByText("Aquecimento concluído")).toBeVisible();
  } else {
    await expect(bloco.getByText(`Dia ${numero.warmupDay} de aquecimento`)).toBeVisible();
  }

  await semErroDeRuntime(page);
  expect(falhasDeApi, "5xx da propria app durante a navegacao").toEqual([]);
});
