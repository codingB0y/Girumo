import test from "node:test";
import assert from "node:assert/strict";
import { CHAVE_VISAO, guardarVisao, lerVisao } from "./visao";

const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("a query manda; sem query vale a última usada; sem nada, passo a passo", () => {
  const store = memoria();
  assert.equal(lerVisao(store, null), "passo");
  guardarVisao(store, "mapa");
  assert.equal(store.getItem(CHAVE_VISAO), "mapa");
  assert.equal(lerVisao(store, null), "mapa");
  assert.equal(lerVisao(store, "passo"), "passo");
  assert.equal(lerVisao(store, "torto"), "mapa", "valor inválido na query é ignorado");
  assert.equal(lerVisao(null, null), "passo", "sem storage (SSR, modo privado) não quebra");
});

test("storage que lança (modo privado) não quebra leitura nem escrita", () => {
  const quebrado = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("bloqueado");
    },
  };
  assert.equal(lerVisao(quebrado, null), "passo");
  assert.doesNotThrow(() => guardarVisao(quebrado, "mapa"));
});
