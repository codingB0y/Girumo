import { strict as assert } from "node:assert";
import { test } from "node:test";

import { datasDoTeste, faixaDoTeste, linhaDoPrecoNoTeste } from "./trial-copy";

const AGORA = new Date("2026-10-06T12:00:00.000Z");
const NADA = { elegivel: false, emTeste: null, cartaoRepetido: false };

test("oferta para quem e elegivel", () => {
  assert.deepEqual(faixaDoTeste({ ...NADA, elegivel: true }, AGORA), {
    tipo: "oferta",
    texto: "Teste o Girumo completo por 7 dias. Hoje você não paga nada.",
    acao: "Ativar 7 dias grátis",
  });
});

test("em teste: dias que faltam, data e valor da cobranca", () => {
  const faixa = faixaDoTeste(
    {
      ...NADA,
      emTeste: { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700, semCobranca: false },
    },
    AGORA,
  );
  assert.deepEqual(faixa, {
    tipo: "em_teste",
    texto: "Teste grátis do plano Growth: faltam 4 dias. Em 10/10 começa a cobrança de R$ 297/mês no cartão cadastrado.",
    acao: "Ver plano",
  });
});

/** Faixa de quem está no teste do Growth (R$ 297), com fim, plano, preço ou "agora" trocados. */
function faixaComFim(fim: string, extra: { plano?: string; precoCents?: number } = {}, agora = AGORA) {
  return faixaDoTeste(
    { ...NADA, emTeste: { fim, plano: "Growth", precoCents: 29700, semCobranca: false, ...extra } },
    agora,
  );
}

// Os dias contam no calendário de Brasília, como a data "Em DD/MM" da mesma frase. Os
// horários ficam perto da meia-noite, onde contar horas, ou contar dias de UTC, erra.
/** Cobrança em 10/10 às 22:30 de Brasília, que já é 11/10 em UTC. */
const FIM_DE_NOITE = "2026-10-11T01:30:00.000Z";

test("dia da ativacao le 7 dias, ate a noite", () => {
  // Ativado 03/10 às 20:00 de Brasília (fim 10/10 às 20:00) e lido às 22:30, já 04/10 em UTC.
  const texto = faixaComFim("2026-10-10T23:00:00.000Z", {}, new Date("2026-10-04T01:30:00.000Z"))?.texto ?? "";
  assert.match(texto, /: faltam 7 dias\. Em 10\/10 começa a cobrança/);
});

test("vespera da cobranca le falta 1 dia o dia inteiro, com a data de amanha", () => {
  const casos = [
    // O relato: ativado 03/10 às 14:00, lido 09/10 às 10:00. Lia "faltam 2 dias. Em 10/10".
    ["2026-10-10T17:00:00.000Z", "2026-10-09T13:00:00.000Z"],
    // 09/10 às 00:10 e às 23:50 de Brasília (a segunda já é 10/10 em UTC).
    [FIM_DE_NOITE, "2026-10-09T03:10:00.000Z"],
    [FIM_DE_NOITE, "2026-10-10T02:50:00.000Z"],
  ];
  for (const [fim, agora] of casos) {
    const texto = faixaComFim(fim, {}, new Date(agora))?.texto ?? "";
    assert.match(texto, /: falta 1 dia\. Em 10\/10 começa a cobrança/, `lido em ${agora}`);
  }
});

test("dia da cobranca le ultimo dia desde a meia-noite, nunca 'faltam 0 dias'", () => {
  // 10/10 às 00:10 de Brasília: faltam 22 horas, mas a cobrança é hoje.
  const texto = faixaComFim(FIM_DE_NOITE, {}, new Date("2026-10-10T03:10:00.000Z"))?.texto ?? "";
  assert.match(texto, /: último dia\. Em 10\/10 começa a cobrança/);
});

test("fim ja passou (webhook atrasado): ultimo dia, nunca dias negativos", () => {
  assert.match(faixaComFim(AGORA.toISOString())?.texto ?? "", /^Teste grátis do plano Growth: último dia\./);
  // 11/10 às 10:00 de Brasília, com a cobrança de 10/10 ainda sem webhook.
  const ontem = faixaComFim(FIM_DE_NOITE, {}, new Date("2026-10-11T13:00:00.000Z"))?.texto ?? "";
  assert.match(ontem, /^Teste grátis do plano Growth: último dia\./);
});

test("data da cobranca no dia de Brasilia, nao no de UTC", () => {
  // 01:30 UTC de 11/10 ainda é 22:30 de 10/10 em Brasília.
  assert.match(faixaComFim("2026-10-11T01:30:00.000Z")?.texto ?? "", /Em 10\/10 começa a cobrança/);
});

test("plano no feminino: a faixa fala do plano, nao do nome solto", () => {
  const texto = faixaComFim("2026-10-10T12:00:00.000Z", { plano: "Operação" })?.texto ?? "";
  assert.match(texto, /^Teste grátis do plano Operação:/);
});

test("preco desconhecido nao vira R$ 0: a faixa omite o valor", () => {
  const texto = faixaComFim("2026-10-10T12:00:00.000Z", { precoCents: 0 })?.texto ?? "";
  assert.match(texto, /Em 10\/10 começa a cobrança no cartão cadastrado\./);
  assert.doesNotMatch(texto, /R\$/);
});

test("teste cancelado no portal: termina sem cobranca e nunca anuncia a cobranca", () => {
  const faixa = faixaDoTeste(
    {
      ...NADA,
      emTeste: { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700, semCobranca: true },
    },
    AGORA,
  );
  assert.deepEqual(faixa, {
    tipo: "em_teste",
    texto: "Teste cancelado — termina em 10/10 sem cobrança.",
    acao: "Ver plano",
  });
  assert.doesNotMatch(faixa?.texto ?? "", /começa a cobrança|R\$/);
});

test("cartao repetido oferece assinar direto, sem falar em teste", () => {
  assert.deepEqual(faixaDoTeste({ ...NADA, cartaoRepetido: true }, AGORA), {
    tipo: "cartao_repetido",
    texto: "Esse cartão já foi usado num teste grátis em outra conta. Não cobramos nada. Pra continuar, assine direto.",
    acao: "Ver planos",
  });
});

test("nada a mostrar: assinatura ativa ou leitura que falhou", () => {
  assert.equal(faixaDoTeste(NADA, AGORA), null);
  assert.equal(faixaDoTeste(null, AGORA), null);
});

test("datas do modal: aviso em 4 dias, cobranca em 7", () => {
  assert.deepEqual(datasDoTeste(new Date("2026-10-03T12:00:00.000Z")), { aviso: "07/10", cobranca: "10/10" });
});

test("datas do modal no dia de Brasilia, nao no de UTC", () => {
  // 22:30 de 03/10 em Brasília (01:30 UTC de 04/10): aviso e cobrança caem em 08/10 e
  // 11/10 de UTC, que ainda são 07/10 e 10/10 aqui.
  assert.deepEqual(datasDoTeste(new Date("2026-10-04T01:30:00.000Z")), { aviso: "07/10", cobranca: "10/10" });
});

test("preco no modo teste", () => {
  assert.equal(linhaDoPrecoNoTeste(19700), "R$ 0 hoje · depois R$ 197/mês");
});

test("nenhum texto do painel fala em reembolso", () => {
  const emTeste = { fim: "2026-10-10T12:00:00.000Z", plano: "Growth", precoCents: 29700 };
  const todos = JSON.stringify([
    faixaDoTeste({ ...NADA, elegivel: true }, AGORA),
    faixaDoTeste({ ...NADA, emTeste: { ...emTeste, semCobranca: false } }, AGORA),
    faixaDoTeste({ ...NADA, emTeste: { ...emTeste, semCobranca: true } }, AGORA),
    faixaDoTeste({ ...NADA, cartaoRepetido: true }, AGORA),
    linhaDoPrecoNoTeste(19700),
  ]);
  assert.doesNotMatch(todos, /reembols|devolv|devolu|garantia|desist|arrepend/i);
});
