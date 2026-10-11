// apps/web/src/lib/resultados/relatorio-anuncios.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lerRelatorioAnuncios } from "./relatorio-anuncios";

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
