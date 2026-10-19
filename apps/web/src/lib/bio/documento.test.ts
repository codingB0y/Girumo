import assert from "node:assert/strict";
import { test } from "node:test";

import { ICONES, MODELOS, PALETAS, SLUG_BIO, UUID_BIO, slugReservado } from "./documento";

/** Dados fictícios: o repositório é público, nada da loja-piloto aqui. */
const L1 = "11111111-2222-4333-8444-555555555555";
const L3 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

test("listas fechadas do contrato (spec §9)", () => {
  assert.deepEqual(MODELOS, ["etiqueta", "vitrine", "romaneio", "classico"]);
  assert.deepEqual(PALETAS, {
    etiqueta: ["azul", "rosa", "menta", "grafite"],
    vitrine: ["papel", "noite", "rose", "azul"],
    romaneio: ["kraft", "caneta", "nota", "azul"],
    classico: ["claro", "escuro", "lavanda", "azul"],
  });
  assert.equal(ICONES.length, 13);
  assert.ok(ICONES.includes("caminhao") && ICONES.includes("link"));
});

test("slug: 3 a 40, minúsculas, números e hífen simples", () => {
  for (const ok of ["abc", "loja-exemplo", "a1-b2-c3", "x".repeat(40)]) assert.ok(SLUG_BIO.test(ok), ok);
  for (const ruim of ["ab", "x".repeat(41), "Loja", "loja--x", "-loja", "loja-", "lója", "loja_x", "_dominio", "a b"]) {
    assert.equal(SLUG_BIO.test(ruim), false, ruim);
  }
});

test("slug reservado: a lista e qualquer um com girumo ou hubflow", () => {
  for (const s of ["_dominio", "admin", "api", "bio", "girumo", "painel", "login", "ajuda", "suporte", "loja-girumo-oficial", "hubflowx"]) {
    assert.equal(slugReservado(s), true, s);
  }
  assert.equal(slugReservado("loja-exemplo"), false);
});

test("uuid minúsculo, o formato do CHECK de bio_contagens.alvo", () => {
  assert.ok(UUID_BIO.test(L1));
  assert.equal(UUID_BIO.test(L3.toUpperCase()), false);
  assert.equal(UUID_BIO.test("visita"), false);
});
