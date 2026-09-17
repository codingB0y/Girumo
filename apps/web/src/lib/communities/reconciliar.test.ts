import { strict as assert } from "node:assert";
import { test } from "node:test";
import { comunidadesNativas } from "./reconciliar";

const pai = {
  whatsappGroupId: "pai@g.us",
  nome: "Mega stock atacado infantil #1",
  isAdmin: true,
  communityJid: "pai@g.us",
  communityRole: "parent" as const,
};
const avisos = {
  whatsappGroupId: "avisos@g.us",
  nome: "Mega stock atacado infantil #1",
  isAdmin: true,
  communityJid: "pai@g.us",
  communityRole: "announce" as const,
};
const filho = (id: string) => ({
  whatsappGroupId: id,
  nome: `Mega Stock Atacado ${id}`,
  isAdmin: true,
  communityJid: "pai@g.us",
  communityRole: "member" as const,
});

test("junta pai avisos e membros numa comunidade", () => {
  const r = comunidadesNativas([pai, avisos, filho("104"), filho("105")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].communityJid, "pai@g.us");
  assert.equal(r[0].nome, "Mega stock atacado infantil #1");
  assert.equal(r[0].avisoGroupId, "avisos@g.us");
  assert.deepEqual(r[0].memberGroupIds, ["104", "105"]);
});

test("comunidade sem nenhum grupo admin fica de fora", () => {
  const alheio = { ...filho("x"), isAdmin: false, communityJid: "gla@g.us" };
  const alheioPai = { ...pai, whatsappGroupId: "gla@g.us", communityJid: "gla@g.us", isAdmin: false };
  assert.deepEqual(comunidadesNativas([alheioPai, alheio]), []);
});

test("basta um grupo admin para a comunidade entrar", () => {
  const paiNaoAdmin = { ...pai, isAdmin: false };
  const r = comunidadesNativas([paiNaoAdmin, filho("104")]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].memberGroupIds, ["104"]);
});

test("sem grupo pai o nome vem do avisos", () => {
  const r = comunidadesNativas([avisos, filho("104")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, "Mega stock atacado infantil #1");
});

test("comunidade sem avisos devolve avisoGroupId nulo", () => {
  const r = comunidadesNativas([pai, filho("104")]);
  assert.equal(r[0].avisoGroupId, null);
});

test("grupos fora de comunidade nao geram nada", () => {
  const solto = {
    whatsappGroupId: "1@g.us",
    nome: "Solto",
    isAdmin: true,
    communityJid: null,
    communityRole: null,
  };
  assert.deepEqual(comunidadesNativas([solto]), []);
});

test("duas comunidades saem separadas", () => {
  const outroPai = { ...pai, whatsappGroupId: "pai2@g.us", communityJid: "pai2@g.us", nome: "#2" };
  const r = comunidadesNativas([pai, filho("104"), outroPai]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((c) => c.communityJid).sort(), ["pai2@g.us", "pai@g.us"]);
});

test("o pai nao entra na lista de membros", () => {
  const r = comunidadesNativas([pai, avisos, filho("104")]);
  assert.ok(!r[0].memberGroupIds.includes("pai@g.us"));
  assert.ok(!r[0].memberGroupIds.includes("avisos@g.us"));
});
