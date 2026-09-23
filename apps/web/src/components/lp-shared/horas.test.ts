import test from "node:test";
import assert from "node:assert/strict";

import { formatHoras, horasNaMao } from "./horas";

test("30 grupos, 2 minutos e 2 posts dao 2 horas por dia e 60 por mes", () => {
  assert.deepEqual(horasNaMao(30, 2, 2), { minutosPorDia: 120, horasPorDia: 2, horasPorMes: 60 });
  assert.equal(formatHoras(2), "2 horas");
  assert.equal(formatHoras(60), "60 horas");
});

test("a conta do atacado: 40 grupos, 3 minutos e 2 posts", () => {
  const tempo = horasNaMao(40, 3, 2);
  assert.equal(formatHoras(tempo.horasPorDia), "4 horas");
  assert.equal(formatHoras(tempo.horasPorMes), "120 horas");
});

test("abaixo de 1 hora a conta fala em minutos", () => {
  assert.equal(formatHoras(horasNaMao(15, 3, 1).horasPorDia), "45 minutos");
  assert.equal(formatHoras(1 / 60), "1 minuto");
  assert.equal(formatHoras(0), "0 minutos");
});

test("hora quebrada usa virgula e fica no singular abaixo de 2", () => {
  assert.equal(formatHoras(1), "1 hora");
  assert.equal(formatHoras(1.5), "1,5 hora");
  assert.equal(formatHoras(2.5), "2,5 horas");
});

test("o arredondamento nao escreve 60 minutos nem 2 hora", () => {
  // 59,6 minutos arredondam para 60: tem que virar "1 hora".
  assert.equal(formatHoras(59.6 / 60), "1 hora");
  // 1,9998 hora arredonda para 2: o plural sai do valor arredondado.
  assert.equal(formatHoras(1.9998), "2 horas");
});

test("numero grande sai com separador de milhar", () => {
  assert.equal(formatHoras(1200), "1.200 horas");
});

test("a conta para em 24 horas por dia, mesmo com numero absurdo", () => {
  // 99999 nos três campos dava "16.666.500.005.000 horas" e estourava o cartão no celular.
  assert.deepEqual(horasNaMao(99999, 99999, 99999), { minutosPorDia: 1440, horasPorDia: 24, horasPorMes: 720 });
  // Produto que estoura em Infinity também para no teto, em vez de virar 0.
  assert.equal(horasNaMao(1e200, 1e200, 1).horasPorDia, 24);
});

test("campo vazio, negativo ou lixo vira 0 em vez de tempo negativo ou NaN", () => {
  for (const invalido of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number("")]) {
    assert.equal(horasNaMao(invalido, 2, 2).minutosPorDia, 0, String(invalido));
    assert.equal(horasNaMao(2, invalido, 2).minutosPorDia, 0, String(invalido));
    assert.equal(horasNaMao(2, 2, invalido).minutosPorDia, 0, String(invalido));
  }
  assert.equal(formatHoras(-3), "0 minutos");
  assert.equal(formatHoras(Number.NaN), "0 minutos");
});
