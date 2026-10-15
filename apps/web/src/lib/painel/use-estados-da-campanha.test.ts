import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstadosDaCampanha } from "@/lib/groups/resumo-estados";
import {
  aplicarLeitura,
  cargaAposLeitura,
  cargaDoSlug,
  estadosFrescos,
  type CargaDosEstados,
} from "./use-estados-da-campanha";

const lida: EstadosDaCampanha = {
  grupos: [],
  contagem: { lotado: 1, enchendo: 1, fila: 0, vazio: 0, membros: 10 },
  regras: { menos_enchendo: 1, lotados: 1, com_gente: 2 },
  estruturaDeComunidade: [],
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

test("a lista de uma campanha nunca aparece em outra: slug novo é carregando até a leitura dele chegar", () => {
  const deA = aplicarLeitura(null, "a", lida);
  assert.deepEqual(cargaDoSlug(deA, "a"), { fase: "pronto", dados: lida, desatualizada: false });
  assert.deepEqual(cargaDoSlug(deA, "b"), { fase: "carregando" });
  assert.deepEqual(cargaDoSlug(aplicarLeitura(deA, "b", outra), "b"), { fase: "pronto", dados: outra, desatualizada: false });
});

test("primeira leitura da campanha nova que falha é erro, não a lista velha da anterior", () => {
  const deA = aplicarLeitura(null, "a", lida);
  assert.deepEqual(cargaDoSlug(aplicarLeitura(deA, "b", null), "b"), { fase: "erro" });
});

test("no mesmo slug, a releitura que falha guarda a lista e marca velha", () => {
  const deA = aplicarLeitura(null, "a", lida);
  assert.deepEqual(cargaDoSlug(aplicarLeitura(deA, "a", null), "a"), { fase: "pronto", dados: lida, desatualizada: true });
  assert.deepEqual(cargaDoSlug(aplicarLeitura(deA, "a", outra), "a"), { fase: "pronto", dados: outra, desatualizada: false });
});

test("slug vazio não tem lista: é carregando, mesmo que haja algo guardado", () => {
  assert.deepEqual(cargaDoSlug(null, ""), { fase: "carregando" });
  assert.deepEqual(cargaDoSlug(aplicarLeitura(null, "a", lida), ""), { fase: "carregando" });
  assert.deepEqual(cargaDoSlug({ slug: "", carga: { fase: "pronto", dados: lida, desatualizada: false } }, ""), {
    fase: "carregando",
  });
});
