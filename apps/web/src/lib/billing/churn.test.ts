import { test } from "node:test";
import assert from "node:assert/strict";
import { CHURN_REASON_MAX, normalizeChurnReason } from "./churn";

const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);

test("texto comum passa limpo", () => {
  assert.equal(normalizeChurnReason("Caro demais pro meu momento"), "Caro demais pro meu momento");
});

test("apara as bordas — o textarea deixa espaço e quebra de linha sobrando", () => {
  assert.equal(normalizeChurnReason("  não uso mais \n\n "), "não uso mais");
});

test("motivo ausente vira null, não string vazia", () => {
  // Gravar "" como motivo polui o relatório de churn com linhas sem conteúdo:
  // quem não escreveu nada é indistinguível de quem escreveu só espaços.
  assert.equal(normalizeChurnReason(""), null);
  assert.equal(normalizeChurnReason("   \n  "), null);
  assert.equal(normalizeChurnReason(undefined), null);
  assert.equal(normalizeChurnReason(null), null);
});

test("tipo não-string vira null em vez de virar '[object Object]'", () => {
  // O corpo vem de JSON de cliente: sem esta guarda, String(valor) grava lixo.
  assert.equal(normalizeChurnReason({ reason: "x" }), null);
  assert.equal(normalizeChurnReason(42), null);
  assert.equal(normalizeChurnReason(["a"]), null);
  assert.equal(normalizeChurnReason(true), null);
});

test("texto gigante é truncado no limite, não rejeitado", () => {
  // Perder o motivo inteiro porque o lojista desabafou é pior do que guardar
  // o começo dele. O corte é no limite exato.
  const gigante = "a".repeat(CHURN_REASON_MAX + 500);
  assert.equal(normalizeChurnReason(gigante)?.length, CHURN_REASON_MAX);
});

test("no limite exato nada é cortado", () => {
  const exato = "b".repeat(CHURN_REASON_MAX);
  assert.equal(normalizeChurnReason(exato), exato);
});

test("caractere de controle sai, acento e emoji ficam", () => {
  // Acento e emoji são conteúdo real do lojista; caractere de controle não é.
  assert.equal(normalizeChurnReason(`caro ${NUL} demais`), "caro  demais");
  assert.equal(normalizeChurnReason(`ruim${BELL}ruim`), "ruimruim");
  assert.equal(normalizeChurnReason("não é intuitivo 😕"), "não é intuitivo 😕");
});

test("quebra de linha interna sobrevive — o lojista escreve em parágrafos", () => {
  assert.equal(normalizeChurnReason("caro demais\ne confuso"), "caro demais\ne confuso");
});
