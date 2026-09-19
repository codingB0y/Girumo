import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classificarPapel } from "./papel";

test("grupo pai da comunidade aponta para si mesmo", () => {
  const r = classificarPapel({ id: "120363314352216368@g.us", isCommunity: true });
  assert.deepEqual(r, { communityJid: "120363314352216368@g.us", communityRole: "parent" });
});

test("grupo de avisos aponta para o pai", () => {
  const r = classificarPapel({
    id: "120363317004683243@g.us",
    isCommunityAnnounce: true,
    linkedParent: "120363314352216368@g.us",
  });
  assert.deepEqual(r, { communityJid: "120363314352216368@g.us", communityRole: "announce" });
});

test("grupo filho comum vira member", () => {
  const r = classificarPapel({
    id: "120363047246515568@g.us",
    linkedParent: "120363314352216368@g.us",
  });
  assert.deepEqual(r, { communityJid: "120363314352216368@g.us", communityRole: "member" });
});

test("grupo fora de comunidade nao tem vinculo", () => {
  const r = classificarPapel({ id: "1@g.us" });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});

test("linkedParent em branco conta como sem vinculo", () => {
  const r = classificarPapel({ id: "1@g.us", linkedParent: "   " });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});

test("linkedParent nulo conta como sem vinculo", () => {
  const r = classificarPapel({ id: "1@g.us", linkedParent: null });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});

test("isCommunity vence mesmo se vier linkedParent junto", () => {
  const r = classificarPapel({ id: "pai@g.us", isCommunity: true, linkedParent: "outro@g.us" });
  assert.deepEqual(r, { communityJid: "pai@g.us", communityRole: "parent" });
});

test("marcado como avisos sem pai nao vira announce solto", () => {
  const r = classificarPapel({ id: "1@g.us", isCommunityAnnounce: true });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});
