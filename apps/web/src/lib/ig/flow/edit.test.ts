import test from "node:test";
import assert from "node:assert/strict";
import { canAddFollowGate, canAddReminder, hasFollowGate, hasReminder, setFollowGate, setReminder, updateNode } from "./edit";
import { RECIPES } from "./recipes";

test("a receita simples mais resposta mais lembrete é exatamente a receita de seguir", () => {
  const simples = RECIPES.comment_invite.build();
  assert.equal(canAddFollowGate(simples), true);
  assert.equal(canAddReminder(simples), false, "sem resposta não há segundo direct");
  const comResposta = setFollowGate(simples, true);
  assert.equal(canAddReminder(comResposta), true);
  assert.deepEqual(setReminder(comResposta, true), RECIPES.comment_follow_invite.build());
});

test("tirar a resposta tira o lembrete junto e volta à receita simples", () => {
  const completa = RECIPES.comment_follow_invite.build();
  assert.equal(hasFollowGate(completa), true);
  assert.equal(hasReminder(completa), true);
  const semResposta = setFollowGate(completa, false);
  assert.equal(hasFollowGate(semResposta), false);
  assert.equal(hasReminder(semResposta), false);
  assert.deepEqual(semResposta, RECIPES.comment_invite.build());
});

test("no fluxo de direct o lembrete entra sem precisar da resposta", () => {
  const def = RECIPES.dm_invite.build();
  assert.equal(canAddFollowGate(def), false);
  assert.equal(canAddReminder(def), true);
  const com = setReminder(def, true);
  assert.ok(com.edges.some((e) => e.from === "convite" && e.out === "not_clicked" && e.to === "lembrete"));
  assert.deepEqual(setReminder(com, false), def);
});

test("mudar a campanha do convite muda a do lembrete; mudar o texto não", () => {
  const def = RECIPES.comment_follow_invite.build();
  const com = updateNode(def, "convite", { campaignSlug: "vip" });
  assert.equal(com.nodes.find((n) => n.id === "lembrete")?.type === "invite" && (com.nodes.find((n) => n.id === "lembrete") as { campaignSlug: string | null }).campaignSlug, "vip");
  const texto = updateNode(def, "convite", { text: "Novo" });
  assert.equal((texto.nodes.find((n) => n.id === "lembrete") as { campaignSlug: string | null }).campaignSlug, null);
  assert.equal(def.nodes.find((n) => n.id === "convite")?.type === "invite" && (def.nodes.find((n) => n.id === "convite") as { text: string }).text, "Oi! Aqui está o link do grupo VIP:", "não muta o original");
});
