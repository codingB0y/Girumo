// apps/web/src/lib/resultados/relatorio-anuncios.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lerRelatorioAnuncios, semGasto } from "./relatorio-anuncios";

const VALIDO = {
  periodo: { de: "2026-01-01", ate: "2026-01-31" },
  total: { cadastros: 6, foram: 1, entraram: 3, ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: 190 },
  linhas: [
    { nivel: "campanha", campanha: "C1", conjunto: null, anuncio: null, cadastros: 4, foram: 1, entraram: 2,
      ja_membros: 1, compradores: 1, pedidos: 2, vendido: 1000, gasto: 100 },
    { nivel: "anuncio", campanha: "C1", conjunto: "S1", anuncio: "A1", cadastros: 2, foram: 1, entraram: 2,
      ja_membros: 0, compradores: 1, pedidos: 1, vendido: 600, gasto: null },
  ],
  por_origem: [{ origem: "ig", cadastros: 3, vendido: 900 }, { origem: null, cadastros: 1, vendido: 0 }],
  por_dia: [{ dia: "2026-01-05", cadastros: 1, entraram: 1 }],
  fora: { entradas_sem_cadastro: 2, pedidos_sem_origem: 2, vendido_sem_origem: 120 },
};

test("aceita o JSON que attribution_report devolve", () => {
  const r = lerRelatorioAnuncios(VALIDO);
  assert.equal(r.total.vendido, 1300);
  assert.equal(r.linhas[1].anuncio, "A1");
  assert.equal(r.linhas[0].gasto, 100);
  assert.equal(r.por_origem[1].origem, null);
});

test("recusa nível desconhecido em vez de desenhar linha errada", () => {
  const ruim = { ...VALIDO, linhas: [{ ...VALIDO.linhas[0], nivel: "grupo" }] };
  assert.throws(() => lerRelatorioAnuncios(ruim), /relatorio invalido/);
});

test("recusa número negativo ou texto no lugar de número", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, cadastros: -1 } }), /relatorio invalido/);
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, vendido: "1300" } }), /relatorio invalido/);
});

test("recusa nulo e lixo", () => {
  assert.throws(() => lerRelatorioAnuncios(null), /relatorio invalido/);
  assert.throws(() => lerRelatorioAnuncios({ periodo: {} }), /relatorio invalido/);
});

test("vendido negativo (pedido de estorno de outro caminho) passa como veio, sem derrubar a aba", () => {
  const r = lerRelatorioAnuncios({
    ...VALIDO,
    total: { ...VALIDO.total, vendido: -50 },
    linhas: [{ ...VALIDO.linhas[0], vendido: -50 }],
    por_origem: [{ origem: "ig", cadastros: 3, vendido: -50 }],
    fora: { ...VALIDO.fora, vendido_sem_origem: -10.5 },
  });
  assert.equal(r.total.vendido, -50);
  assert.equal(r.linhas[0].vendido, -50);
  assert.equal(r.fora.vendido_sem_origem, -10.5);
});

test("gasto negativo continua recusado: ad_spend não aceita, então é contrato quebrado", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, gasto: -1 } }), /relatorio invalido/);
  assert.throws(
    () => lerRelatorioAnuncios({ ...VALIDO, linhas: [{ ...VALIDO.linhas[0], gasto: -1 }] }),
    /relatorio invalido/,
  );
});

test("vendido infinito ou NaN continua recusado", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, vendido: Number.NaN } }), /relatorio invalido/);
  assert.throws(
    () => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, vendido: Number.POSITIVE_INFINITY } }),
    /relatorio invalido/,
  );
});

test("sem ads:manage: todo gasto vira null e some a campanha que só existia pelo gasto", () => {
  const r = lerRelatorioAnuncios({
    ...VALIDO,
    linhas: [
      ...VALIDO.linhas,
      { nivel: "campanha", campanha: "Só gasto", conjunto: null, anuncio: null, cadastros: 0, foram: 0, entraram: 0,
        ja_membros: 0, compradores: 0, pedidos: 0, vendido: 0, gasto: 90 },
    ],
  });
  const escondido = semGasto(r);
  assert.equal(escondido.total.gasto, null);
  assert.ok(escondido.linhas.every((l) => l.gasto === null));
  assert.deepEqual(escondido.linhas.map((l) => l.campanha), ["C1", "C1"]);
  assert.doesNotMatch(JSON.stringify(escondido), /"gasto":\d|Só gasto/);
  // O resto do relatório passa igual, e a entrada não é mutada.
  assert.deepEqual({ ...escondido.total, gasto: r.total.gasto }, r.total);
  assert.equal(r.total.gasto, 190);
  assert.equal(r.linhas.length, 3);
});

test("o contrato do SQL continua estrito: total.gasto null vindo do banco é erro, não gasto escondido", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, gasto: null } }), /relatorio invalido/);
});
