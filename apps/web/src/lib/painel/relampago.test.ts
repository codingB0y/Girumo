import assert from "node:assert/strict";
import { test } from "node:test";

import {
  etiquetaDaOferta,
  horarioComSegundos,
  fraseDosGrupos,
  motivoDoBotao,
  fraseNoAr,
  noArHa,
  ordinal,
  pecasRestantes,
  placarDaOferta,
  proximaDaFila,
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

const ABRIU = "2026-09-07T12:00:00.000Z";
const depois = (ms: number) => new Date(Date.parse(ABRIU) + ms);
const MIN = 60_000;
const H = 60 * MIN;
const DIA = 24 * H;

test("noArHa abaixo de 1 min é agora, abaixo de 1 h são minutos", () => {
  assert.equal(noArHa(ABRIU, depois(0)), "agora");
  assert.equal(noArHa(ABRIU, depois(59_999)), "agora");
  assert.equal(noArHa(ABRIU, depois(MIN)), "1 min");
  assert.equal(noArHa(ABRIU, depois(4 * MIN + 12_000)), "4 min");
  assert.equal(noArHa(ABRIU, depois(H - 1)), "59 min");
});

test("noArHa abaixo de 24 h são horas, sem '0 min'", () => {
  assert.equal(noArHa(ABRIU, depois(H)), "1 h");
  assert.equal(noArHa(ABRIU, depois(2 * H + 10 * MIN)), "2 h 10 min");
  assert.equal(noArHa(ABRIU, depois(5 * H)), "5 h");
  assert.equal(noArHa(ABRIU, depois(DIA - 1)), "23 h 59 min");
});

test("noArHa de 24 h para cima são dias inteiros", () => {
  assert.equal(noArHa(ABRIU, depois(DIA)), "1 dia");
  assert.equal(noArHa(ABRIU, depois(25 * H)), "1 dia");
  assert.equal(noArHa(ABRIU, depois(2 * DIA)), "2 dias");
  assert.equal(noArHa(ABRIU, depois(11 * DIA + 3 * H)), "11 dias");
});

test("sem opened_at não existe cronômetro (nunca um 0:00 inventado)", () => {
  const agora = new Date("2026-09-07T12:04:12.000Z");
  assert.equal(noArHa(null, agora), null);
  assert.equal(noArHa(undefined, agora), null);
  assert.equal(noArHa("nao é data", agora), null);
});

test("relógio do navegador adiantado (idade negativa) não mostra tempo negativo", () => {
  assert.equal(noArHa(ABRIU, depois(-60_000)), "agora");
});

test("fraseNoAr: 'no ar agora' em vez de 'no ar há agora'", () => {
  assert.equal(fraseNoAr("agora"), "no ar agora");
  assert.equal(fraseNoAr("2 h 10 min"), "no ar há 2 h 10 min");
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

// Fila de exemplo na ordem: vendida, dropped, em conversa, reservada, duas esperando.
const emConversa: EntradaLike & { id: string } = { id: "e3", outcome: null, claim: { id: "c4", contacted_at: "x" } };
const fila = [
  { id: "e1", ...vendida },
  { id: "e2", ...desistiu },
  emConversa,
  { id: "e4", ...reservada },
  { id: "e5", ...naFila },
  { id: "e6", ...naFila },
];

test("placar: pediram é a fila; atendidas tem claim ou desfecho; esperando não tem nenhum", () => {
  assert.deepEqual(placarDaOferta(fila), { pediram: 6, atendidas: 4, vendeu: 1, esperando: 2 });
});

test("placar da fila vazia é tudo zero", () => {
  assert.deepEqual(placarDaOferta([]), { pediram: 0, atendidas: 0, vendeu: 0, esperando: 0 });
});

test("próxima da fila é a primeira, na ordem, sem reserva e sem desfecho", () => {
  assert.equal(proximaDaFila(fila)?.id, "e5");
});

test("sem ninguém esperando, não há próxima", () => {
  assert.equal(proximaDaFila(fila.slice(0, 4)), null);
  assert.equal(proximaDaFila([]), null);
});

test("peças restantes é slots menos vendidas; reserva ainda não tirou a peça", () => {
  assert.deepEqual(pecasRestantes({ slots: 5, status: "open" }, fila), { restantes: 4, pecas: 5 });
});

test("peças restantes nunca fica negativa", () => {
  assert.deepEqual(pecasRestantes({ slots: 1, status: "open" }, [vendida, vendida]), { restantes: 0, pecas: 1 });
});

test("frase dos grupos: até dois nomes e 'e mais N'; sem nome achado, só a contagem", () => {
  const grupos = [
    { whatsappGroupId: "a@g.us", name: "VIP 1" },
    { whatsappGroupId: "b@g.us", name: "VIP 2" },
    { whatsappGroupId: "c@g.us", name: "VIP 3" },
  ];
  assert.equal(fraseDosGrupos(["a@g.us"], grupos), "em 1 grupo: VIP 1");
  assert.equal(fraseDosGrupos(["a@g.us", "b@g.us", "c@g.us"], grupos), "em 3 grupos: VIP 1, VIP 2 e mais 1");
  assert.equal(fraseDosGrupos(["x@g.us", "y@g.us"], grupos), "em 2 grupos");
  assert.equal(fraseDosGrupos([], grupos), "sem grupo aberto");
});

test("motivo do botão: conversa na mão, peças acabaram, todas reservadas, ninguém esperando, livre", () => {
  const of = { slots: 2, status: "open" as const };
  const espera: EntradaLike = { outcome: null, claim: null };
  const reserva: EntradaLike = { outcome: null, claim: {} };
  const vendida: EntradaLike = { outcome: "sold", claim: {} };
  assert.equal(motivoDoBotao(of, [espera], true), "termine a conversa atual antes");
  assert.equal(motivoDoBotao(of, [vendida, vendida, espera], false), "as peças acabaram");
  assert.equal(motivoDoBotao(of, [reserva, reserva, espera], false), "todas as peças estão reservadas");
  assert.equal(motivoDoBotao(of, [vendida], false), "ninguém esperando");
  assert.equal(motivoDoBotao(of, [espera], false), null);
});
