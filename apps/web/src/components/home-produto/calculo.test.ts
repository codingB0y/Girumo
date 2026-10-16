import test from "node:test";
import assert from "node:assert/strict";

import { ajustar, custoPorDia, horaQueFechaConta, minutosNaMao, tempoPorExtenso } from "./calculo";

test("a conta da calculadora: grupos x posts x minutos x dias", () => {
  // O exemplo que a página abre: 20 grupos, 2 posts por dia, 1 minuto em cada, 1 mês.
  assert.equal(minutosNaMao({ grupos: 20, posts: 2, minutos: 1, dias: 30 }), 1200);
  assert.equal(minutosNaMao({ grupos: 20, posts: 2, minutos: 1, dias: 1 }), 40);
  assert.equal(minutosNaMao({ grupos: 5, posts: 3, minutos: 2, dias: 7 }), 210);
});

test("o tempo sai por extenso, com singular e sem '0 minutos'", () => {
  assert.equal(tempoPorExtenso(1), "1 minuto");
  assert.equal(tempoPorExtenso(40), "40 minutos");
  assert.equal(tempoPorExtenso(60), "1 hora");
  assert.equal(tempoPorExtenso(61), "1 hora e 1 minuto");
  assert.equal(tempoPorExtenso(280), "4 horas e 40 minutos");
  assert.equal(tempoPorExtenso(1200), "20 horas");
});

test("custo por dia do plano mensal, em reais com centavos", () => {
  assert.equal(custoPorDia(297), "R$\u00a09,90");
  assert.equal(custoPorDia(197), "R$\u00a06,57");
});

test("a hora que fecha a conta arredonda pra cima", () => {
  // R$ 297 por 20 horas de postagem = R$ 14,85 a hora: a página diz "mais de R$ 15".
  assert.equal(horaQueFechaConta(297, 1200), 15);
  assert.equal(horaQueFechaConta(300, 1200), 15);
  assert.equal(horaQueFechaConta(301, 1200), 16);
});

test("o seletor de + e - não passa dos limites", () => {
  assert.equal(ajustar(20, 1, [1, 200]), 21);
  assert.equal(ajustar(1, -1, [1, 200]), 1);
  assert.equal(ajustar(200, 1, [1, 200]), 200);
});
