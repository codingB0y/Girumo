import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ehEstruturaDeComunidade } from "./estrutura";

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
