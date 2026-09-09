import assert from "node:assert/strict";
import { test } from "node:test";

import {
  etiquetaDaOferta,
  horarioComSegundos,
  noArHa,
  ordinal,
  relogio,
  resumoDaOferta,
  type EntradaLike,
} from "./relampago";

test("ordinal fala como a lojista: 1ª, 2ª, 13ª", () => {
  assert.equal(ordinal(0), "1ª");
  assert.equal(ordinal(1), "2ª");
  assert.equal(ordinal(12), "13ª");
});

test("horário da fila mostra o segundo, que é o que separa 1ª de 2ª", () => {
  assert.equal(horarioComSegundos("2026-09-07T15:03:41.000Z"), "12:03:41");
  assert.equal(horarioComSegundos("2026-09-07T15:03:58.000Z"), "12:03:58");
});

test("data inválida não vira 'Invalid Date' na tela", () => {
  assert.equal(horarioComSegundos("nao é data"), "");
});

test("relógio formata minutos e segundos", () => {
  assert.equal(relogio(252), "4:12");
  assert.equal(relogio(9), "0:09");
  assert.equal(relogio(0), "0:00");
});

test("relógio acima de uma hora ganha a casa das horas", () => {
  assert.equal(relogio(3852), "1:04:12");
});

test("noArHa conta de opened_at", () => {
  const agora = new Date("2026-09-07T12:04:12.000Z");
  assert.equal(noArHa("2026-09-07T12:00:00.000Z", agora), "4:12");
});

test("sem opened_at não existe cronômetro (nunca um 0:00 inventado)", () => {
  const agora = new Date("2026-09-07T12:04:12.000Z");
  assert.equal(noArHa(null, agora), null);
  assert.equal(noArHa(undefined, agora), null);
  assert.equal(noArHa("nao é data", agora), null);
});

test("relógio do navegador atrasado não mostra tempo negativo", () => {
  const agora = new Date("2026-09-07T11:59:00.000Z");
  assert.equal(noArHa("2026-09-07T12:00:00.000Z", agora), "0:00");
});

const vendida: EntradaLike = { outcome: "sold", claim: { id: "c1" } };
const reservada: EntradaLike = { outcome: null, claim: { id: "c2" } };
const naFila: EntradaLike = { outcome: null, claim: null };
const desistiu: EntradaLike = { outcome: "dropped", claim: { id: "c3" } };

test("resumo separa vendida, reservada e livre", () => {
  const r = resumoDaOferta({ slots: 5, status: "open" }, [vendida, reservada, naFila, naFila]);
  assert.deepEqual(r, { pecas: 5, vendidas: 1, reservadas: 1, livres: 3, naFila: 4 });
});

test("quem desistiu devolve a peça pro estoque", () => {
  const r = resumoDaOferta({ slots: 3, status: "open" }, [desistiu, naFila]);
  assert.equal(r.vendidas, 0);
  assert.equal(r.reservadas, 0);
  assert.equal(r.livres, 3);
});

test("mais vendas que peças não gera vaga negativa", () => {
  const r = resumoDaOferta({ slots: 1, status: "open" }, [vendida, vendida, vendida]);
  assert.equal(r.livres, 0);
});

test("fila vazia deixa todas as peças livres", () => {
  assert.deepEqual(resumoDaOferta({ slots: 5, status: "open" }, []), {
    pecas: 5,
    vendidas: 0,
    reservadas: 0,
    livres: 5,
    naFila: 0,
  });
});

test("etiqueta escreve a cena 5", () => {
  assert.equal(etiquetaDaOferta("NOVO KIT", 5), "NOVO KIT · 5 peças");
  assert.equal(etiquetaDaOferta("Vestido midi", 1), "Vestido midi · 1 peça");
});

test("oferta sem nome não vira etiqueta em branco", () => {
  assert.equal(etiquetaDaOferta("   ", 3), "Oferta · 3 peças");
});
