import assert from "node:assert/strict";
import { test } from "node:test";

import { telefoneCanonico, variantesDoTelefone } from "./telefone";

const WITH_NINE = ["11987654321", "5511987654321", "1187654321", "551187654321"];
const WITHOUT_NINE = ["1187654321", "551187654321", "11987654321", "5511987654321"];

/**
 * O banco grava só dígitos e não normaliza o 55 nem o 9º dígito: o mesmo
 * cliente pode estar em qualquer uma dessas formas. A lista tem sempre as
 * variantes com e sem 55 e com e sem o 9; a ordem não é parte do contrato.
 */
const CASES: Array<{ why: string; input: string; variants: string[] | null; canonical: string | null }> = [
  { why: "celular com 9, só dígitos", input: "11987654321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "celular formatado com +55", input: "+55 (11) 98765-4321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "celular com o 55 colado", input: "5511987654321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "celular antigo sem o 9 ganha a variante com 9", input: "(11) 8765-4321", variants: WITHOUT_NINE, canonical: "551187654321" },
  { why: "celular antigo com 55", input: "551187654321", variants: WITHOUT_NINE, canonical: "551187654321" },
  { why: "fixo (começa em 2 a 5) não ganha 9", input: "1133334444", variants: ["1133334444", "551133334444"], canonical: "551133334444" },
  { why: "DDD 55 com 10 dígitos não perde o 55", input: "5532221100", variants: ["5532221100", "555532221100"], canonical: "555532221100" },
  { why: "0 de tronco antes do DDD", input: "011 98765-4321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "0 de tronco com parênteses, fixo", input: "(011) 3456-7890", variants: ["1134567890", "551134567890"], canonical: "551134567890" },
  { why: "0 de tronco solto", input: "0 11 98765-4321", variants: WITH_NINE, canonical: "5511987654321" },
  { why: "menos de 10 dígitos", input: "987654321", variants: null, canonical: null },
  { why: "DDD terminado em zero", input: "1087654321", variants: null, canonical: null },
  { why: "DDD começando em zero", input: "0187654321", variants: null, canonical: null },
  { why: "dígitos demais", input: "55119876543210", variants: null, canonical: null },
  { why: "só zeros", input: "00", variants: null, canonical: null },
  { why: "lixo", input: "abc", variants: null, canonical: null },
  { why: "vazio", input: "", variants: null, canonical: null },
];

for (const { why, input, variants, canonical } of CASES) {
  test(`${why}: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(variantesDoTelefone(input), variants);
    assert.equal(telefoneCanonico(input), canonical);
  });
}
