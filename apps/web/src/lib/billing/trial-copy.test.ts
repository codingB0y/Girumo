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
    texto: "Teste grátis do Growth: faltam 4 dias. Em 10/10 começa a cobrança de R$ 297/mês no cartão cadastrado.",
    acao: "Ver plano",
  });
});

test("ultimo dia do teste", () => {
  const fim = new Date(AGORA.getTime() + 5 * 3_600_000).toISOString();
  const faixa = faixaDoTeste(
    { ...NADA, emTeste: { fim, plano: "Growth", precoCents: 29700, semCobranca: false } },
    AGORA,
  );
  assert.match(faixa?.texto ?? "", /^Teste grátis do Growth: último dia\./);
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
