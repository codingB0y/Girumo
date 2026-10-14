import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import { cargaAposLeitura, estadosFrescos, type CargaDosEstados } from "./use-estados-da-campanha";

const lida: EstadosDaCampanha = {
  grupos: [],
  contagem: { lotado: 1, enchendo: 1, fila: 0, vazio: 0, membros: 10 },
  regras: { menos_enchendo: 1, lotados: 1, com_gente: 2 },
  estruturaDeComunidade: 0,
};
const outra: EstadosDaCampanha = { ...lida, contagem: { ...lida.contagem, lotado: 2 } };

test("a leitura que volta vira a lista da tela, sem aviso de velha", () => {
  assert.deepEqual(cargaAposLeitura({ fase: "carregando" }, lida), { fase: "pronto", dados: lida, desatualizada: false });
  assert.deepEqual(cargaAposLeitura({ fase: "erro" }, lida), { fase: "pronto", dados: lida, desatualizada: false });
  assert.deepEqual(cargaAposLeitura({ fase: "pronto", dados: lida, desatualizada: true }, outra), {
    fase: "pronto",
    dados: outra,
    desatualizada: false,
  });
});

test("a releitura que falha guarda a lista e marca velha; sem lista, é erro", () => {
  const pronta: CargaDosEstados = { fase: "pronto", dados: lida, desatualizada: false };
  assert.deepEqual(cargaAposLeitura(pronta, null), { fase: "pronto", dados: lida, desatualizada: true });
  assert.deepEqual(cargaAposLeitura({ fase: "carregando" }, null), { fase: "erro" });
});

test("quem não mostra lista velha (Link e cliques, Visão geral) vê a velha como erro", () => {
  assert.equal(estadosFrescos({ fase: "carregando" }), null);
  assert.equal(estadosFrescos({ fase: "erro" }), "erro");
  assert.equal(estadosFrescos({ fase: "pronto", dados: lida, desatualizada: true }), "erro");
  assert.equal(estadosFrescos({ fase: "pronto", dados: lida, desatualizada: false }), lida);
});
