import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ehEstruturaDeComunidade, idsDeEstrutura, semEstrutura } from "./estrutura";

test("parent e estrutura", () => {
  assert.equal(ehEstruturaDeComunidade({ community_role: "parent" }), true);
});

test("announce e estrutura", () => {
  assert.equal(ehEstruturaDeComunidade({ community_role: "announce" }), true);
});

test("member nao e estrutura", () => {
  assert.equal(ehEstruturaDeComunidade({ community_role: "member" }), false);
});

test("null nao e estrutura", () => {
  assert.equal(ehEstruturaDeComunidade({ community_role: null }), false);
});

test("campo ausente nao e estrutura", () => {
  assert.equal(ehEstruturaDeComunidade({}), false);
});

test("semEstrutura tira o pai e o Avisos dos groupIds da campanha e mantém o resto", () => {
  const estrutura = idsDeEstrutura([
    { whatsapp_group_id: "pai@g.us", community_role: "parent" },
    { whatsapp_group_id: "avisos@g.us", community_role: "announce" },
    { whatsapp_group_id: "g1@g.us", community_role: "member" },
  ]);
  assert.deepEqual([...estrutura].sort(), ["avisos@g.us", "pai@g.us"]);
  const [c] = semEstrutura([{ id: "c", groupIds: ["pai@g.us", "g1@g.us", "avisos@g.us", "sumiu@g.us"] }], estrutura);
  assert.deepEqual(c.groupIds, ["g1@g.us", "sumiu@g.us"]);
});
