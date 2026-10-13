import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadoGrupo } from "./estado";
import { detalheDoGrupo, diasAtras, fraseDoLink, proximoDoLink, resumirEstados } from "./resumo-estados";

const TODAS = { menos_enchendo: true, lotados: true, com_gente: true };
const NENHUMA = { menos_enchendo: false, lotados: false, com_gente: false };
/** 12h de 10/10 em Brasília. */
const AGORA = new Date("2026-10-10T15:00:00Z");

function grupo(parcial: Partial<EstadoGrupo> & Pick<EstadoGrupo, "posicao" | "estado">): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-${String(parcial.posicao).padStart(12, "0")}`,
    whatsappGroupId: `g${parcial.posicao}@g.us`,
    nome: `Moda Kids do Sul ${parcial.posicao}`,
    membros: 10,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/C${parcial.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: NENHUMA,
    ...parcial,
  };
}

test("resumo conta cada estado, soma membros e lê as regras de naRegra", () => {
  const grupos = [
    grupo({ posicao: 1, estado: "lotado", membros: 1003, naRegra: TODAS }),
    grupo({ posicao: 2, estado: "lotado", membros: 812, naRegra: TODAS }),
    grupo({ posicao: 3, estado: "enchendo", membros: 958, naRegra: { menos_enchendo: false, lotados: false, com_gente: true } }),
    grupo({ posicao: 4, estado: "fila", membros: 412, naRegra: { menos_enchendo: true, lotados: false, com_gente: true } }),
    // Fila sem admin: estado fila, nenhuma regra. Mutante: contar a regra pelo estado.
    grupo({ posicao: 5, estado: "fila", membros: 30, isAdmin: false }),
    grupo({ posicao: 6, estado: "vazio", membros: 1 }),
  ];

  const { contagem, regras } = resumirEstados(grupos);

  assert.deepEqual(contagem, { lotado: 2, enchendo: 1, fila: 2, vazio: 1, membros: 3216 });
  assert.deepEqual(regras, { menos_enchendo: 3, lotados: 2, com_gente: 4 });
  // Review Focus 4: os quatro estados somam o total. Estado novo que nenhum contador pega aparece aqui.
  assert.equal(contagem.lotado + contagem.enchendo + contagem.fila + contagem.vazio, grupos.length);
});

test("campanha sem grupo resolvido é tudo zero, nunca NaN", () => {
  assert.deepEqual(resumirEstados([]), {
    contagem: { lotado: 0, enchendo: 0, fila: 0, vazio: 0, membros: 0 },
    regras: { menos_enchendo: 0, lotados: 0, com_gente: 0 },
  });
});

test("dias contados em Brasília: 23h de SP ainda é hoje, mesmo com o UTC no dia seguinte", () => {
  // Review Focus 3. 02:00Z de 10/10 = 23:00 de 09/10 em SP.
  const agora = new Date("2026-10-10T02:00:00Z");
  assert.equal(diasAtras("2026-10-09T12:00:00Z", agora), "hoje"); // 09h de 09/10 em SP; UTC diria "ontem"
  assert.equal(diasAtras("2026-10-09T02:30:00Z", agora), "ontem"); // 23h30 de 08/10 em SP
  assert.equal(diasAtras("2026-10-06T15:00:00Z", agora), "há 3 dias");
  assert.equal(diasAtras("2026-10-11T12:00:00Z", agora), "hoje"); // relógio adiantado não vira "há -2 dias"
  assert.equal(diasAtras("não é data", agora), "");
});

test("detalhe do lotado diz quando e como lotou", () => {
  const auto = grupo({ posicao: 1, estado: "lotado", lotadoEm: "2026-09-19T15:00:00Z", lotadoPor: "auto" });
  const mao = grupo({ posicao: 10, estado: "lotado", lotadoEm: "2026-10-10T11:00:00Z", lotadoPor: "manual" });
  assert.equal(detalheDoGrupo(auto, [auto, mao], AGORA), "Lotou há 21 dias · automático");
  assert.equal(detalheDoGrupo(mao, [auto, mao], AGORA), "Lotou hoje · marcado à mão");
});

test("reaberto enchendo: a frase do link, o pausado e para onde o link volta", () => {
  const grupos = [
    grupo({ posicao: 11, estado: "lotado", lotadoEm: "2026-10-08T15:00:00Z", lotadoPor: "auto" }),
    grupo({ posicao: 12, estado: "enchendo", membros: 958, reabertoEm: "2026-10-09T18:00:00Z" }),
    grupo({ posicao: 13, estado: "fila", membros: 412 }),
    grupo({ posicao: 14, estado: "fila", membros: 38 }),
    grupo({ posicao: 16, estado: "vazio", membros: 1 }),
  ];

  assert.deepEqual(fraseDoLink(grupos, AGORA), {
    tipo: "enchendo",
    nome: "Moda Kids do Sul 12",
    reaberto: "ontem",
    voltaPara: 13,
  });
  assert.equal(detalheDoGrupo(grupos[1], grupos, AGORA), "Reaberto ontem · prioridade no link");
  assert.equal(detalheDoGrupo(grupos[2], grupos, AGORA), "Pausado: volta a encher quando o 12 lotar");
  assert.equal(detalheDoGrupo(grupos[3], grupos, AGORA), "Aguardando a vez");
  assert.equal(detalheDoGrupo(grupos[4], grupos, AGORA), "Só o nosso número");
});

test("sem grupo enchendo o link está parado; enchendo sem reabrir não fala de prioridade", () => {
  assert.deepEqual(fraseDoLink([grupo({ posicao: 1, estado: "lotado" })], AGORA), { tipo: "parado" });

  const normal = [grupo({ posicao: 1, estado: "enchendo" }), grupo({ posicao: 2, estado: "fila" })];
  assert.deepEqual(fraseDoLink(normal, AGORA), {
    tipo: "enchendo",
    nome: "Moda Kids do Sul 1",
    reaberto: null,
    voltaPara: null,
  });
  assert.equal(detalheDoGrupo(normal[0], normal, AGORA), "Recebendo quem clica no link");
  // Sem reaberto ninguém está "pausado".
  assert.equal(detalheDoGrupo(normal[1], normal, AGORA), "Aguardando a vez");
});

test("fila que o link pula diz o porquê, em vez de 'Aguardando a vez'", () => {
  const semAdmin = grupo({ posicao: 2, estado: "fila", isAdmin: false });
  const semConvite = grupo({ posicao: 3, estado: "fila", inviteUrl: null });
  const conviteTorto = grupo({ posicao: 4, estado: "fila", inviteUrl: "chat.whatsapp.com/sem-esquema" });
  const todos = [semAdmin, semConvite, conviteTorto];
  assert.equal(detalheDoGrupo(semAdmin, todos, AGORA), "Nosso número não é admin: o link pula este grupo");
  assert.equal(detalheDoGrupo(semConvite, todos, AGORA), "Sem convite: o link pula este grupo");
  assert.equal(detalheDoGrupo(conviteTorto, todos, AGORA), "Sem convite: o link pula este grupo");
});

test("o próximo do link pula quem o link pula e põe reaberto na frente da ordem", () => {
  const grupos = [
    grupo({ posicao: 1, estado: "enchendo", reabertoEm: "2026-10-10T10:00:00Z" }),
    grupo({ posicao: 2, estado: "fila", isAdmin: false }),
    grupo({ posicao: 3, estado: "fila", inviteUrl: null }),
    grupo({ posicao: 4, estado: "lotado" }),
    grupo({ posicao: 5, estado: "vazio", membros: 1 }),
    grupo({ posicao: 6, estado: "fila", reabertoEm: "2026-10-10T12:00:00Z" }),
  ];
  assert.equal(proximoDoLink(grupos)?.posicao, 6, "o segundo reaberto vence a ordem");
  assert.equal(proximoDoLink(grupos.slice(0, 5))?.posicao, 5, "vazio com admin e convite também recebe");
  assert.equal(proximoDoLink(grupos.slice(0, 4)), null);
});
