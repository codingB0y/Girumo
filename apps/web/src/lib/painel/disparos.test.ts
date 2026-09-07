import assert from "node:assert/strict";
import { test } from "node:test";

import type { Group } from "@/lib/mock-data";
import { alcance, fraseAlcance, quadradinhos, rotuloPostar } from "./disparos";

function grupo(over: Partial<Group> & { id: string; members: number }): Group {
  return {
    name: over.id,
    whatsappGroupId: `${over.id}@g.us`,
    capacity: 1024,
    selected: false,
    engagement: "medio",
    ...over,
  } as Group;
}

const A = grupo({ id: "a", members: 578 });
const B = grupo({ id: "b", members: 1024 });
const C = grupo({ id: "c", members: 12 });

test("alcance soma os membros dos grupos da campanha", () => {
  const r = alcance([A, B, C], ["a", "b"]);
  assert.deepEqual(r, { grupos: 2, pessoas: 1602, desconhecidos: 0 });
});

test("alcance casa por whatsappGroupId (prod grava o id do WhatsApp)", () => {
  const r = alcance([A, B], ["a@g.us", "b@g.us"]);
  assert.equal(r.grupos, 2);
  assert.equal(r.pessoas, 1602);
});

test("o mesmo grupo por id e por whatsappGroupId conta uma vez só", () => {
  const r = alcance([A], ["a", "a@g.us"]);
  assert.deepEqual(r, { grupos: 1, pessoas: 578, desconhecidos: 0 });
});

test("alvo fora da lista carregada é contado à parte, nunca somado como zero", () => {
  const r = alcance([A], ["a", "sumiu"]);
  assert.deepEqual(r, { grupos: 1, pessoas: 578, desconhecidos: 1 });
});

test("campanha sem grupos não alcança ninguém", () => {
  assert.deepEqual(alcance([A], []), { grupos: 0, pessoas: 0, desconhecidos: 0 });
  assert.deepEqual(alcance([A], undefined), { grupos: 0, pessoas: 0, desconhecidos: 0 });
});

test("membros negativos ou ausentes não subtraem do alcance", () => {
  const torto = grupo({ id: "t", members: -5 });
  const semCampo = { id: "s", name: "s", whatsappGroupId: "s@g.us" } as unknown as Group;
  assert.equal(alcance([torto, semCampo], ["t", "s"]).pessoas, 0);
});

test("fraseAlcance escreve a cena 2 com milhar em pt-BR", () => {
  assert.equal(
    fraseAlcance({ grupos: 13, pessoas: 9736, desconhecidos: 0 }),
    "Vai pra 13 grupos · 9.736 pessoas veem",
  );
});

test("fraseAlcance concorda no singular", () => {
  assert.equal(fraseAlcance({ grupos: 1, pessoas: 1, desconhecidos: 0 }), "Vai pra 1 grupo · 1 pessoa vê");
});

test("fraseAlcance avisa quando a conta está incompleta", () => {
  assert.match(fraseAlcance({ grupos: 2, pessoas: 100, desconhecidos: 3 }), /3 grupos fora da lista$/);
});

test("fraseAlcance sem grupos instrui em vez de mostrar zero", () => {
  assert.match(fraseAlcance({ grupos: 0, pessoas: 0, desconhecidos: 0 }), /escolha os grupos/);
  assert.match(fraseAlcance({ grupos: 0, pessoas: 0, desconhecidos: 2 }), /não estão mais na sua lista/);
});

test("rotuloPostar leva a contagem para o botão", () => {
  assert.equal(rotuloPostar({ grupos: 13, pessoas: 9736, desconhecidos: 0 }), "Postar em 13 grupos");
  assert.equal(rotuloPostar({ grupos: 1, pessoas: 5, desconhecidos: 0 }), "Postar em 1 grupo");
  assert.equal(rotuloPostar({ grupos: 0, pessoas: 0, desconhecidos: 0 }), "Postar");
});

test("quadradinhos enchem na proporção do envio", () => {
  assert.deepEqual(quadradinhos({ sent: 7, total: 13 }), { total: 13, entregues: 7 });
  assert.deepEqual(quadradinhos({ sent: 0, total: 13 }), { total: 13, entregues: 0 });
});

test("quadradinhos truncam em 40 e reescalam o preenchimento", () => {
  const q = quadradinhos({ sent: 50, total: 100 });
  assert.equal(q.total, 40);
  assert.equal(q.entregues, 20);
});

test("enviado acima do total não desenha caixa fantasma", () => {
  assert.deepEqual(quadradinhos({ sent: 99, total: 13 }), { total: 13, entregues: 13 });
});

test("disparo sem alvo não desenha quadradinho", () => {
  assert.deepEqual(quadradinhos({ sent: 3, total: 0 }), { total: 0, entregues: 0 });
});
