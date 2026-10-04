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

test("ultimo dia do teste", () => {
  const fim = new Date(AGORA.getTime() + 5 * 3_600_000).toISOString();
  const faixa = faixaDoTeste(
    { ...NADA, emTeste: { fim, plano: "Growth", precoCents: 29700, semCobranca: false } },
    AGORA,
  );
  assert.match(faixa?.texto ?? "", /^Teste grátis do plano Growth: último dia\./);
});

/** Faixa de quem está no teste do Growth (R$ 297), com fim, plano ou preço trocados. */
function faixaComFim(fim: string, extra: { plano?: string; precoCents?: number } = {}) {
  return faixaDoTeste(
    { ...NADA, emTeste: { fim, plano: "Growth", precoCents: 29700, semCobranca: false, ...extra } },
    AGORA,
  );
}

test("dias contados para baixo: 3,5 dias ainda sao 3", () => {
  const fim = new Date(AGORA.getTime() + 3.5 * 86_400_000).toISOString();
  assert.match(faixaComFim(fim)?.texto ?? "", /: faltam 3 dias\./);
});

test("um dia restante no singular", () => {
  const fim = new Date(AGORA.getTime() + 1.5 * 86_400_000).toISOString();
  assert.match(faixaComFim(fim)?.texto ?? "", /: falta 1 dia\./);
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
