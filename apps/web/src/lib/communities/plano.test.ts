import assert from "node:assert/strict";
import { test } from "node:test";

import { TETO_DA_COMUNIDADE } from "./lotacao";
import {
  GRUPOS_POR_COMUNIDADE,
  ehGrupoInterno,
  montarPlano,
  piorCasoDoGrupo,
  type GrupoParaPlano,
  type ParticipanteLido,
  type PlanoDeComunidades,
} from "./plano";

const grupos = (tamanhos: readonly number[]): GrupoParaPlano[] =>
  tamanhos.map((members, i) => ({ whatsappGroupId: `g${i + 1}@g.us`, name: `Grupo ${i + 1}`, members }));

/** Os 37 grupos de clientes da loja do plano de 09/11/2026, tamanhos lidos em prod em 12/11. */
const LOJA = [
  874, 835, 827, 763, 761, 735, 558, 215, 203, 74, 73, 68, 62, 58, 55, 54, 51, 50, 45, 44, 41, 38, 34, 32, 27, 25,
  24, 22, 22, 22, 20, 19, 18, 17, 16, 13, 11,
];

/** O que vale para todo plano, qualquer que seja a entrada. */
function assertPlanoValido(plano: PlanoDeComunidades, entrada: readonly GrupoParaPlano[]): void {
  const colocados = plano.comunidades.flatMap((c) => c.grupos.map((g) => g.whatsappGroupId));
  const fora = plano.naoCabem.map((g) => g.whatsappGroupId);
  assert.deepEqual([...colocados, ...fora].sort(), entrada.map((g) => g.whatsappGroupId).sort(), "cada grupo em um lugar só");
  for (const c of plano.comunidades) {
    assert.ok(c.piorCaso <= TETO_DA_COMUNIDADE, `comunidade ${c.numero} passa do teto no pior caso: ${c.piorCaso}`);
    assert.ok(c.pessoasHoje <= TETO_DA_COMUNIDADE, `comunidade ${c.numero} já passa do teto hoje`);
    assert.ok(c.grupos.length <= GRUPOS_POR_COMUNIDADE, `comunidade ${c.numero} com mais de 100 grupos`);
    assert.ok(c.grupos.filter((g) => g.grande).length <= 1, `comunidade ${c.numero} com dois grupos grandes`);
    assert.ok(c.grupos.length > 0, `comunidade ${c.numero} vazia`);
  }
}

test("pior caso: o grande enche até 1.024, o pequeno dobra, e ninguém passa do teto do grupo", () => {
  assert.equal(piorCasoDoGrupo(874), 1024);
  assert.equal(piorCasoDoGrupo(700), 1024);
  assert.equal(piorCasoDoGrupo(699), 1024);
  assert.equal(piorCasoDoGrupo(215), 430);
  assert.equal(piorCasoDoGrupo(0), 0);
  assert.equal(piorCasoDoGrupo(1500), 1500);
});

test("interno vai de 0 a 4 pessoas", () => {
  assert.equal(ehGrupoInterno(4), true);
  assert.equal(ehGrupoInterno(1), true);
  assert.equal(ehGrupoInterno(5), false);
});

test("loja de 09/11: 37 grupos em 7 comunidades, um grande em cada, o de 558 sozinho com os pequenos", () => {
  const entrada = grupos(LOJA);
  const plano = montarPlano(entrada);

  assertPlanoValido(plano, entrada);
  assert.equal(plano.comunidades.length, 7);
  assert.equal(plano.naoCabem.length, 0);
  assert.equal(plano.pessoasHoje, 6806);
  assert.equal(plano.pessoasEstimadas, true, "sem participantes lidos, é soma");

  // 558 dobra até 1.024 e não cabe ao lado de um grande de 1.024: pede a comunidade dele.
  const doMedio = plano.comunidades.find((c) => c.grupos.some((g) => g.members === 558));
  assert.ok(doMedio);
  assert.equal(doMedio.grupos.filter((g) => g.grande).length, 0);

  // Equilibrado pelo pior caso: a mais cheia e a mais vazia ficam perto.
  const piores = plano.comunidades.map((c) => c.piorCaso);
  assert.ok(Math.max(...piores) - Math.min(...piores) <= 100, `desequilibrado: ${piores.join(", ")}`);
});

test("loja de 09/11 com o grupo médio menor: as 6 comunidades do plano feito à mão", () => {
  const entrada = grupos(LOJA.map((m) => (m === 558 ? 400 : m)));
  const plano = montarPlano(entrada);

  assertPlanoValido(plano, entrada);
  assert.equal(plano.comunidades.length, 6);
  for (const c of plano.comunidades) assert.equal(c.grupos.filter((g) => g.grande).length, 1);
});

test("grupo que sozinho passa do teto fica de fora e o resto é planejado", () => {
  const entrada = grupos([2500, 900, 120]);
  const plano = montarPlano(entrada);

  assertPlanoValido(plano, entrada);
  assert.deepEqual(
    plano.naoCabem.map((g) => g.members),
    [2500],
  );
  assert.equal(plano.comunidades.length, 1);
  assert.equal(plano.pessoasHoje, 1020, "quem não cabe não conta no total do plano");
});

test("poucos grupos pequenos cabem numa comunidade só", () => {
  const entrada = grupos([50, 30, 20]);
  const plano = montarPlano(entrada);

  assertPlanoValido(plano, entrada);
  assert.equal(plano.comunidades.length, 1);
  assert.equal(plano.comunidades[0].piorCaso, 200);
  assert.deepEqual(
    plano.comunidades[0].grupos.map((g) => g.members),
    [50, 30, 20],
  );
});

test("todos pequenos: o teto de 100 grupos divide antes do teto de pessoas", () => {
  const entrada = grupos(Array.from({ length: 150 }, () => 5));
  const plano = montarPlano(entrada);

  assertPlanoValido(plano, entrada);
  assert.equal(plano.comunidades.length, 2);
  assert.deepEqual(
    plano.comunidades.map((c) => c.grupos.length),
    [75, 75],
  );
});

test("sem grupos não há comunidade", () => {
  const plano = montarPlano([]);
  assert.deepEqual(plano, { comunidades: [], naoCabem: [], pessoasHoje: 0, pessoasEstimadas: false });
});

test("grupo repetido na entrada entra uma vez", () => {
  const [a, b] = grupos([300, 200]);
  const plano = montarPlano([a, b, a]);
  assert.equal(plano.comunidades[0].grupos.length, 2);
});

test("pessoas hoje desconta quem está em dois grupos, com a última leitura de cada grupo", () => {
  const [a, b] = grupos([3, 2]);
  const agora = "2026-11-12T12:00:00.000Z";
  const antiga = "2026-11-01T12:00:00.000Z";
  const participantes: ParticipanteLido[] = [
    { whatsappGroupId: a.whatsappGroupId, participantLid: "p1@lid", lastSeenAt: agora },
    { whatsappGroupId: a.whatsappGroupId, participantLid: "p2@lid", lastSeenAt: agora },
    { whatsappGroupId: a.whatsappGroupId, participantLid: "p3@lid", lastSeenAt: agora },
    // saiu do grupo b há 11 dias: a linha ficou, mas não é gente de hoje
    { whatsappGroupId: b.whatsappGroupId, participantLid: "p3@lid", lastSeenAt: antiga },
    { whatsappGroupId: b.whatsappGroupId, participantLid: "p1@lid", lastSeenAt: agora },
    { whatsappGroupId: b.whatsappGroupId, participantLid: "p4@lid", lastSeenAt: agora },
  ];

  const plano = montarPlano([a, b], participantes);

  assert.equal(plano.comunidades[0].pessoasHoje, 4, "p1 está nos dois e conta uma vez; p3 já saiu do b");
  assert.equal(plano.comunidades[0].pessoasEstimadas, false);
  assert.equal(plano.pessoasHoje, 4);
});

test("grupo sem participantes lidos deixa a comunidade como estimativa por cima", () => {
  const [a, b] = grupos([3, 2]);
  const participantes: ParticipanteLido[] = [
    { whatsappGroupId: a.whatsappGroupId, participantLid: "p1@lid", lastSeenAt: "2026-11-12T12:00:00.000Z" },
  ];

  const plano = montarPlano([a, b], participantes);

  assert.equal(plano.comunidades[0].pessoasHoje, 5);
  assert.equal(plano.comunidades[0].pessoasEstimadas, true);
});
