import assert from "node:assert/strict";
import { test } from "node:test";

import { DESTINO_PADRAO, NENHUM_GRUPO_NA_REGRA, lerDestino } from "./destino";

const CAMPANHA = { group_ids: ["g1@g.us", "g2@g.us", "g3@g.us"] };
const SEM_GRUPOS = "Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar.";
const DE_FORA = "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.";
const LISTA_VAZIA = "Escolha ao menos um grupo.";

test("sem destino nenhum vale o padrão seguro: todos menos o que está enchendo (D5)", () => {
  // Antes do seletor, post sem lista ia para TODOS os grupos da campanha.
  assert.deepEqual(lerDestino({ body: "oi" }, CAMPANHA), { ok: true, destino: { regra: "menos_enchendo" } });
  assert.deepEqual(DESTINO_PADRAO, { regra: "menos_enchendo" });
});

test("o padrão é congelado: a tela o usa como estado inicial e ninguém pode mutá-lo", () => {
  assert.equal(Object.isFrozen(DESTINO_PADRAO), true);
});

test("as três regras do contrato passam como regra", () => {
  for (const regra of ["menos_enchendo", "lotados", "com_gente"] as const) {
    assert.deepEqual(lerDestino({ destino: { regra } }, CAMPANHA), { ok: true, destino: { regra } });
  }
});

test("regra fora do contrato é recusada, não vira padrão nem 'todos'", () => {
  assert.deepEqual(lerDestino({ destino: { regra: "todos" } }, CAMPANHA), { ok: false, error: "Regra de destino inválida." });
  assert.deepEqual(lerDestino({ destino: { regra: null } }, CAMPANHA), { ok: false, error: "Regra de destino inválida." });
});

test("lista fixa com grupos da campanha: sem repetidos e sem espaço, na ordem enviada", () => {
  assert.deepEqual(lerDestino({ destino: { grupos: [" g3@g.us", "g1@g.us", "g3@g.us"] } }, CAMPANHA), {
    ok: true,
    destino: { grupos: ["g3@g.us", "g1@g.us"] },
  });
});

test("groupIds legado vira lista fixa com a mesma conferência", () => {
  assert.deepEqual(lerDestino({ groupIds: ["g2@g.us"] }, CAMPANHA), { ok: true, destino: { grupos: ["g2@g.us"] } });
  assert.deepEqual(lerDestino({ groupIds: ["x@g.us"] }, CAMPANHA), { ok: false, error: DE_FORA });
});

test("destino vence groupIds quando os dois chegam", () => {
  assert.deepEqual(lerDestino({ destino: { regra: "lotados" }, groupIds: ["g1@g.us"] }, CAMPANHA), {
    ok: true,
    destino: { regra: "lotados" },
  });
});

test("grupo que não está (ou não está mais) na campanha é recusado: antes passava sem conferência", () => {
  assert.deepEqual(lerDestino({ destino: { grupos: ["g1@g.us", "saiu@g.us"] } }, CAMPANHA), { ok: false, error: DE_FORA });
});

test("o Avisos da comunidade nativa entra só quando a rota o permite", () => {
  const avisos = "120363099@g.us";
  assert.deepEqual(lerDestino({ destino: { grupos: [avisos] } }, CAMPANHA, [avisos]), {
    ok: true,
    destino: { grupos: [avisos] },
  });
  assert.deepEqual(lerDestino({ destino: { grupos: [avisos] } }, CAMPANHA), { ok: false, error: DE_FORA });
  // Comunidade sem grupo vinculado: o Avisos é o único destino possível.
  assert.deepEqual(lerDestino({ destino: { grupos: [avisos] } }, { group_ids: [] }, [avisos]), {
    ok: true,
    destino: { grupos: [avisos] },
  });
});

test("lista vazia é recusada", () => {
  assert.deepEqual(lerDestino({ destino: { grupos: [] } }, CAMPANHA), { ok: false, error: LISTA_VAZIA });
  assert.deepEqual(lerDestino({ destino: { grupos: ["  "] } }, CAMPANHA), { ok: false, error: LISTA_VAZIA });
  // `groupIds: []` era "todos" antes; agora é lista vazia como qualquer outra.
  assert.deepEqual(lerDestino({ groupIds: [] }, CAMPANHA), { ok: false, error: LISTA_VAZIA });
});

test("campanha sem grupos mantém a mensagem de sempre", () => {
  assert.deepEqual(lerDestino({}, { group_ids: [] }), { ok: false, error: SEM_GRUPOS });
  assert.deepEqual(lerDestino({ destino: { regra: "com_gente" } }, { group_ids: [] }), { ok: false, error: SEM_GRUPOS });
  assert.deepEqual(lerDestino({ groupIds: [] }, { group_ids: [] }), { ok: false, error: SEM_GRUPOS });
});

test("forma inválida de destino é recusada", () => {
  for (const destino of ["menos_enchendo", ["g1@g.us"], {}, { grupos: "g1@g.us" }, { grupos: [1] }]) {
    assert.equal(lerDestino({ destino }, CAMPANHA).ok, false, JSON.stringify(destino));
  }
});

test("a mensagem de regra vazia é a do contrato", () => {
  assert.equal(NENHUM_GRUPO_NA_REGRA, "Nenhum grupo nesta regra agora.");
});
