import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";
import { DESTINO_PADRAO } from "./destino";
import {
  FRASE_DA_REGRA,
  alternar,
  avisoEnchendo,
  destinoDaCampanha,
  fraseListaFixa,
  fraseResumo,
  fraseVazios,
  resumoDoDestino,
  selecionados,
} from "./destino-ui";

/** O que a API de estados manda: `naRegra` vem PRONTO do banco. */
function grupo(posicao: number, estado: EstadoDoGrupo, membros: number, naRegra: EstadoGrupo["naRegra"]): EstadoGrupo {
  return {
    posicao,
    groupId: `00000000-0000-4000-8000-00000000000${posicao}`,
    whatsappGroupId: `g${posicao}@g.us`,
    nome: `Moda Kids do Sul ${posicao}`,
    membros,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/x",
    lotadoEm: estado === "lotado" ? "2026-10-08T12:00:00.000Z" : null,
    lotadoPor: estado === "lotado" ? "auto" : null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado,
    podeReabrir: false,
    naRegra,
  };
}

const FORA_DE_TODAS = { menos_enchendo: false, lotados: false, com_gente: false };

// Pool como o mockup: lotado, enchendo, fila, um "fila" que o banco tirou das
// regras (não somos admin) e um vazio.
const GRUPOS: EstadoGrupo[] = [
  grupo(1, "lotado", 1003, { menos_enchendo: true, lotados: true, com_gente: true }),
  grupo(2, "enchendo", 958, { menos_enchendo: false, lotados: false, com_gente: true }),
  grupo(3, "fila", 412, { menos_enchendo: true, lotados: false, com_gente: true }),
  { ...grupo(4, "fila", 300, FORA_DE_TODAS), isAdmin: false },
  grupo(5, "vazio", 1, FORA_DE_TODAS),
];

test("regra: o destino é o que o banco marcou em naRegra, na ordem do pool", () => {
  assert.deepEqual(selecionados(GRUPOS, { regra: "menos_enchendo" }), ["g1@g.us", "g3@g.us"]);
  assert.deepEqual(selecionados(GRUPOS, { regra: "lotados" }), ["g1@g.us"]);
  assert.deepEqual(selecionados(GRUPOS, { regra: "com_gente" }), ["g1@g.us", "g2@g.us", "g3@g.us"]);
});

test("a tela não recalcula a regra pelo estado: o 'fila' que o banco tirou fica de fora", () => {
  // Mutante: filtrar por g.estado em vez de naRegra levaria o g4 (sem admin).
  assert.equal(selecionados(GRUPOS, { regra: "menos_enchendo" }).includes("g4@g.us"), false);
  assert.equal(selecionados(GRUPOS, { regra: "com_gente" }).includes("g4@g.us"), false);
});

test("lista fixa: os marcados que existem nos estados, na ordem do pool", () => {
  assert.deepEqual(selecionados(GRUPOS, { grupos: ["g5@g.us", "g1@g.us", "sumiu@g.us"] }), ["g1@g.us", "g5@g.us"]);
});

test("mexer numa caixa a partir da regra vira lista fixa (D8)", () => {
  assert.deepEqual(alternar(GRUPOS, DESTINO_PADRAO, "g3@g.us"), { grupos: ["g1@g.us"] });
  assert.deepEqual(alternar(GRUPOS, DESTINO_PADRAO, "g5@g.us"), { grupos: ["g1@g.us", "g3@g.us", "g5@g.us"] });
});

test("na lista fixa a caixa marca e desmarca, sem carregar grupo que sumiu dos estados", () => {
  const fixa = { grupos: ["g1@g.us", "sumiu@g.us"] };
  assert.deepEqual(alternar(GRUPOS, fixa, "g2@g.us"), { grupos: ["g1@g.us", "g2@g.us"] });
  assert.deepEqual(alternar(GRUPOS, fixa, "g1@g.us"), { grupos: [] });
});

test("aviso amarelo só quando o grupo que está enchendo está no destino (D6)", () => {
  assert.equal(avisoEnchendo(GRUPOS, DESTINO_PADRAO), null);
  assert.equal(avisoEnchendo(GRUPOS, { regra: "com_gente" })?.nome, "Moda Kids do Sul 2");
  assert.equal(avisoEnchendo(GRUPOS, { grupos: ["g2@g.us"] })?.whatsappGroupId, "g2@g.us");
  assert.equal(avisoEnchendo(GRUPOS, { grupos: ["g1@g.us"] }), null);
});

test("resumo conta os grupos e soma as pessoas do destino", () => {
  assert.deepEqual(resumoDoDestino(GRUPOS, DESTINO_PADRAO), { grupos: 2, pessoas: 1415 });
  assert.equal(fraseResumo({ grupos: 2, pessoas: 1415 }), "2 grupos · 1.415 pessoas");
  assert.equal(fraseResumo({ grupos: 1, pessoas: 1 }), "1 grupo · 1 pessoa");
});

test("nota dos vazios: só os vazios que ficaram de fora (D7)", () => {
  assert.equal(fraseVazios(GRUPOS, DESTINO_PADRAO), "1 vazio fica de fora — marque à mão se quiser.");
  assert.equal(fraseVazios(GRUPOS, { grupos: ["g5@g.us"] }), null);
  const doisVazios = [...GRUPOS, grupo(6, "vazio", 1, FORA_DE_TODAS)];
  assert.equal(fraseVazios(doisVazios, DESTINO_PADRAO), "2 vazios ficam de fora — marque à mão se quiser.");
});

test("frases da regra e da lista fixa", () => {
  assert.match(FRASE_DA_REGRA.menos_enchendo, /refeita na hora do envio/);
  assert.match(FRASE_DA_REGRA.menos_enchendo, /enchendo na hora fica de fora/);
  assert.match(FRASE_DA_REGRA.com_gente, /inclusive o que estiver enchendo/);
  assert.match(FRASE_DA_REGRA.lotados, /só os grupos lotados/);
  assert.equal(fraseListaFixa(0), "Marque ao menos um grupo.");
  assert.equal(fraseListaFixa(1), "Você mexeu na lista: sai só neste grupo, mesmo que ele lote ou comece a encher até lá.");
  assert.equal(
    fraseListaFixa(3),
    "Você mexeu na lista: sai exatamente nestes 3 grupos, mesmo que algum lote ou comece a encher até lá.",
  );
});

test("trocar de campanha volta ao atalho padrão; a mesma campanha mantém a escolha", () => {
  const escolha = { slug: "moda-kids", destino: { grupos: ["g1@g.us"] } };
  assert.deepEqual(destinoDaCampanha(escolha, "moda-kids"), { grupos: ["g1@g.us"] });
  // Mutante: devolver a escolha sem olhar o slug mandaria a lista de uma campanha
  // para outra — 400 "grupo de fora" no melhor caso.
  assert.deepEqual(destinoDaCampanha(escolha, "outra"), DESTINO_PADRAO);
  assert.deepEqual(destinoDaCampanha(null, "moda-kids"), DESTINO_PADRAO);
});
