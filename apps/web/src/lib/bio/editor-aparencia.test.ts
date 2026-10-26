// apps/web/src/lib/bio/editor-aparencia.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoBio, documentoPadrao, MODELOS, PALETAS, type DocumentoBio } from "@/lib/bio/documento";

import {
  amostraDaPaleta,
  comModelo,
  corDoSeletor,
  coresDaMarca,
  DESCRICAO_DO_MODELO,
  NOME_DA_PALETA,
} from "./editor-aparencia";

const BASE: DocumentoBio = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });

test("cada paleta pronta tem nome, e cada modelo uma descrição", () => {
  for (const modelo of MODELOS) {
    for (const paleta of PALETAS[modelo]) assert.ok(NOME_DA_PALETA[paleta], `${modelo}/${paleta}`);
    assert.ok(DESCRICAO_DO_MODELO[modelo], modelo);
  }
  assert.equal(NOME_DA_PALETA.azul, "Azul");
  assert.equal(NOME_DA_PALETA.escuro, "Preto e amarelo");
});

test("amostra da paleta: o fundo e o botão em destaque que a página pinta (no Romaneio, o carimbo)", () => {
  assert.deepEqual(amostraDaPaleta("etiqueta", "azul"), ["#286AA6", "#E98B2B"]);
  assert.deepEqual(amostraDaPaleta("vitrine", "papel"), ["#FAF7F2", "#1B1A17"]);
  assert.deepEqual(amostraDaPaleta("romaneio", "kraft"), ["#C4A07A", "#B3261E"]);
  assert.deepEqual(amostraDaPaleta("classico", "escuro"), ["#111111", "#FFD400"]);
});

test("trocar de modelo: a mesma paleta se o novo tem, a da marca fica, senão a primeira; o documento continua válido", () => {
  const rosa: DocumentoBio = { ...BASE, modelo: "etiqueta", paleta: "rosa" };
  assert.equal(comModelo(rosa, "vitrine").paleta, "papel");
  assert.equal(comModelo({ ...BASE, paleta: "azul" }, "romaneio").paleta, "azul");
  const marca: DocumentoBio = { ...BASE, paleta: "marca", cores: { fundo: "#FFF0E0", botao: "#C2185B" } };
  assert.deepEqual(comModelo(marca, "classico"), { ...marca, modelo: "classico" });
  for (const modelo of MODELOS) assert.ok(documentoBio.safeParse(comModelo(rosa, modelo)).success, modelo);
});

test("cores da marca: as escolhidas; sem elas, as da paleta que está na tela", () => {
  assert.deepEqual(coresDaMarca({ ...BASE, modelo: "etiqueta", paleta: "rosa", cores: null }), { fundo: "#B83A6B", botao: "#FFD24D" });
  assert.deepEqual(coresDaMarca({ ...BASE, paleta: "marca", cores: { fundo: "#FFF0E0", botao: "#C2185B" } }), {
    fundo: "#FFF0E0",
    botao: "#C2185B",
  });
});

test("paleta pronta guarda as cores da marca pra quando voltar: o documento continua válido", () => {
  // Premissa sobre o PR 2 (§9: `cores` é obrigatório com "marca", não proibido sem ela).
  assert.equal(documentoBio.safeParse({ ...BASE, paleta: "rosa", cores: { fundo: "#FFF0E0", botao: "#C2185B" } }).success, true);
});

test("seletor de cor: seis dígitos hex, com ou sem #, viram #RRGGBB maiúsculo; o resto não é cor", () => {
  assert.equal(corDoSeletor("#286aa6"), "#286AA6");
  assert.equal(corDoSeletor(" 286AA6 "), "#286AA6");
  assert.equal(corDoSeletor("#28a"), null);
  assert.equal(corDoSeletor("azul"), null);
  assert.equal(corDoSeletor("#286AA6F"), null);
});
