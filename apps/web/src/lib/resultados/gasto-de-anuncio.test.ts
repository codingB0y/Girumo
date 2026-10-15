// apps/web/src/lib/resultados/gasto-de-anuncio.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aparar,
  campanhasDisponiveis,
  ehRespostaDoGasto,
  formularioDe,
  formularioNovo,
  iniciosDosLancamentos,
  lerFormulario,
  MAX_VALOR,
  mensagemDeFalha,
  pedidoDoGasto,
  periodoDoLancamento,
  textoDoRodape,
  valorDigitado,
  type FormularioDeGasto,
  type LancamentoDeGasto,
} from "./gasto-de-anuncio";
import type { LinhaRelatorio } from "./relatorio-anuncios";

const L1: LancamentoDeGasto = {
  id: "l1",
  utm_campaign: "VIP Atacado — Goiânia",
  starts_on: "2026-09-11",
  ends_on: "2026-10-10",
  amount: 1620,
};

const FORM: FormularioDeGasto = { campanha: "VIP Atacado — Goiânia", valor: "1.620,00", de: "2026-09-11", ate: "2026-10-10" };

function linha(nivel: LinhaRelatorio["nivel"], campanha: string | null, conjunto: string | null = null): LinhaRelatorio {
  return {
    nivel, campanha, conjunto, anuncio: null,
    cadastros: 1, foram: 0, entraram: 0, ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0, gasto: null,
  };
}

function erroDe(form: FormularioDeGasto): string {
  const lido = lerFormulario(form);
  assert.equal(lido.ok, false);
  return lido.ok ? "" : lido.erro;
}

test("valor em reais como o lojista digita: vírgula decimal, milhar com ponto, R$ e espaços", () => {
  assert.equal(valorDigitado("R$ 1.620,00"), 1620);
  assert.equal(valorDigitado("R$ 980,00"), 980);
  assert.equal(valorDigitado("1620"), 1620);
  assert.equal(valorDigitado("1.620,5"), 1620.5);
  assert.equal(valorDigitado("240,99"), 240.99);
  assert.equal(valorDigitado("149.90"), 149.9);
});

test("\"1.620\" sem vírgula é mil seiscentos e vinte, não R$ 1,62", () => {
  assert.equal(valorDigitado("1.620"), 1620);
  assert.equal(valorDigitado("1.620.000"), 1_620_000);
});

test("valor fora do check da tabela é recusado: zero, negativo, centavo que arredonda a zero, mais de 10 milhões, lixo", () => {
  for (const t of ["", "R$", "0", "0,00", "-5", "0,004", "10.000.000,01", "abc"]) {
    assert.equal(valorDigitado(t), null, t);
  }
  assert.equal(valorDigitado("10.000.000,00"), MAX_VALOR);
  assert.equal(valorDigitado("0,01"), 0.01);
});

test("formulário vira o corpo da rota, com a campanha aparada e o valor em centavos", () => {
  assert.deepEqual(lerFormulario({ ...FORM, campanha: "  VIP Atacado — Goiânia " }), {
    ok: true,
    corpo: { utm_campaign: "VIP Atacado — Goiânia", amount: 1620, starts_on: "2026-09-11", ends_on: "2026-10-10" },
  });
  // Um dia só é período válido (ends_on >= starts_on).
  assert.equal(lerFormulario({ ...FORM, ate: "2026-09-11" }).ok, true);
});

test("formulário recusado diz o porquê", () => {
  // A opção vazia do seletor ("Escolha a campanha…") manda "": salvar sem escolher para aqui.
  assert.equal(erroDe({ ...FORM, campanha: "" }), "Escolha a campanha.");
  assert.equal(erroDe({ ...FORM, campanha: "   " }), "Escolha a campanha.");
  assert.equal(erroDe({ ...FORM, campanha: "x".repeat(201) }), "Escolha a campanha.");
  assert.match(erroDe({ ...FORM, valor: "0" }), /Valor inválido/);
  assert.equal(erroDe({ ...FORM, de: "2026-02-30" }), "Escolha as datas de início e fim.");
  assert.equal(erroDe({ ...FORM, ate: "" }), "Escolha as datas de início e fim.");
  assert.equal(erroDe({ ...FORM, ate: "2026-09-10" }), "A data final vem antes da inicial.");
});

test("formulário novo vem com o período da aba; editar traz o valor no formato digitável, ida e volta", () => {
  assert.deepEqual(formularioNovo({ de: "2026-09-11", ate: "2026-10-10" }), {
    campanha: "", valor: "", de: "2026-09-11", ate: "2026-10-10",
  });
  const f = formularioDe({ ...L1, amount: 1620.5 });
  assert.deepEqual(f, { campanha: "VIP Atacado — Goiânia", valor: "1.620,50", de: "2026-09-11", ate: "2026-10-10" });
  assert.equal(valorDigitado(f.valor), 1620.5);
});

test("campanhas: nível campanha do relatório, sem (sem UTM), mais as já lançadas, sem repetir, em ordem", () => {
  const linhas = [
    linha("campanha", "VIP Atacado — Goiânia"),
    linha("conjunto", "VIP Atacado — Goiânia", "Mulheres 25-45"),
    linha("campanha", "Brasil"),
    linha("campanha", null),
    // Maior que o check da tabela: escolher daria erro na hora de salvar.
    linha("campanha", "x".repeat(201)),
  ];
  // "Remarketing" parou de chegar (fora dos 400 dias), mas tem lançamento: continua na lista.
  const lancamentos = [L1, { ...L1, id: "l2", utm_campaign: "Remarketing" }];
  assert.deepEqual(campanhasDisponiveis(linhas, lancamentos), ["Brasil", "Remarketing", "VIP Atacado — Goiânia"]);
  assert.deepEqual(campanhasDisponiveis([], []), []);
});

test("período do lançamento, começos para o gráfico e o rodapé do cartão", () => {
  assert.equal(periodoDoLancamento(L1), "11/09 a 10/10");
  assert.equal(periodoDoLancamento({ ...L1, ends_on: "2026-09-11" }), "11/09");
  assert.deepEqual(iniciosDosLancamentos([L1]), [{ dia: "2026-09-11", campanha: "VIP Atacado — Goiânia" }]);
  assert.equal(textoDoRodape(0), "nenhum lançamento");
  assert.equal(textoDoRodape(1), "1 lançamento");
  assert.equal(textoDoRodape(3), "3 lançamentos");
});

test("guarda da resposta: só lançamentos com valor numérico e campanhas em texto", () => {
  assert.equal(ehRespostaDoGasto({ lancamentos: [L1], campanhas: ["A"] }), true);
  assert.equal(ehRespostaDoGasto({ lancamentos: [], campanhas: [] }), true);
  assert.equal(ehRespostaDoGasto(null), false);
  assert.equal(ehRespostaDoGasto({ error: "erro" }), false);
  assert.equal(ehRespostaDoGasto({ lancamentos: [{ ...L1, amount: "1620" }], campanhas: [] }), false);
  assert.equal(ehRespostaDoGasto({ lancamentos: [], campanhas: [1] }), false);
});

test("aparar tira só espaço ASCII das pontas, como o btrim do SQL", () => {
  assert.equal(aparar(" VIP "), "VIP");
  assert.equal(aparar("  a b  "), "a b");
  assert.equal(aparar("\tVIP"), "\tVIP");
  assert.equal(aparar("\u00a0VIP"), "\u00a0VIP");
  assert.equal(aparar("VIP\n"), "VIP\n");
});

test("nome com NBSP na ponta não é aparado pelo formulário (o relatório também não)", () => {
  const lido = lerFormulario({ ...FORM, campanha: "\u00a0VIP" });
  assert.equal(lido.ok && lido.corpo.utm_campaign, "\u00a0VIP");
});

test("\"0.500\" é meio real, não quinhentos", () => {
  assert.equal(valorDigitado("0.500"), 0.5);
});

const CORPO = { utm_campaign: "Remarketing", amount: 240.5, starts_on: "2026-10-01", ends_on: "2026-10-10" };

test("cada operação monta o seu pedido: criar POST, editar PATCH no id, excluir DELETE sem corpo", () => {
  assert.deepEqual(pedidoDoGasto({ tipo: "criar" }, CORPO), {
    url: "/api/anuncios/gasto",
    method: "POST",
    body: JSON.stringify(CORPO),
  });
  assert.deepEqual(pedidoDoGasto({ tipo: "editar", id: "l1" }, CORPO), {
    url: "/api/anuncios/gasto/l1",
    method: "PATCH",
    body: JSON.stringify(CORPO),
  });
  assert.deepEqual(pedidoDoGasto({ tipo: "excluir", id: "l1" }), { url: "/api/anuncios/gasto/l1", method: "DELETE" });
});

test("falha: vale o `error` do JSON, depois o texto puro (403 de permissão e do guard de módulo)", () => {
  const salvar = { tipo: "criar" } as const;
  assert.equal(mensagemDeFalha(salvar, { error: "A data final vem antes da inicial." }, "{}"), "A data final vem antes da inicial.");
  assert.equal(mensagemDeFalha(salvar, null, "Sem permissão para esta ação."), "Sem permissão para esta ação.");
  assert.equal(mensagemDeFalha({ tipo: "excluir", id: "l1" }, null, " Sem permissão para esta ação. "), "Sem permissão para esta ação.");
});

test("falha sem mensagem aproveitável: texto da operação (salvar e editar x excluir)", () => {
  assert.equal(mensagemDeFalha({ tipo: "criar" }, null, ""), "Não deu para salvar o gasto.");
  assert.equal(mensagemDeFalha({ tipo: "editar", id: "l1" }, { error: 500 }, "  "), "Não deu para salvar o gasto.");
  assert.equal(mensagemDeFalha({ tipo: "excluir", id: "l1" }, {}, ""), "Não deu para excluir o gasto.");
});

test("falha: HTML e corpo comprido nunca vão para a tela", () => {
  const html = "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>";
  assert.equal(mensagemDeFalha({ tipo: "excluir", id: "l1" }, null, html), "Não deu para excluir o gasto.");
  assert.equal(mensagemDeFalha({ tipo: "criar" }, null, "x".repeat(201)), "Não deu para salvar o gasto.");
  assert.equal(mensagemDeFalha({ tipo: "criar" }, { error: "y".repeat(201) }, ""), "Não deu para salvar o gasto.");
  assert.equal(mensagemDeFalha({ tipo: "criar" }, { error: "<b>x</b>" }, ""), "Não deu para salvar o gasto.");
});
