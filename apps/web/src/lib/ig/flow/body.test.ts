import test from "node:test";
import assert from "node:assert/strict";
import { createBodySchema, isUuid, patchBodySchema } from "./body";
import { RECIPES } from "./recipes";

test("criar aceita receita conhecida e nome opcional; recusa receita inventada", () => {
  assert.equal(createBodySchema.safeParse({ recipe: "dm_invite" }).success, true);
  assert.equal(createBodySchema.safeParse({ recipe: "dm_invite", name: "  Grupo VIP " }).data?.name, "Grupo VIP");
  assert.equal(createBodySchema.safeParse({ recipe: "manychat" }).success, false);
  assert.equal(createBodySchema.safeParse({ recipe: "dm_invite", status: "live" }).success, false, "campo extra");
});

test("o PATCH aceita nome e rascunho, nunca status nem publicado", () => {
  assert.equal(patchBodySchema.safeParse({ draft: RECIPES.blank.build() }).success, true);
  assert.equal(patchBodySchema.safeParse({ name: "" }).success, false);
  assert.equal(patchBodySchema.safeParse({ published: RECIPES.blank.build() }).success, false);
  assert.equal(patchBodySchema.safeParse({}).success, false, "vazio não salva nada");
});

test("isUuid", () => {
  assert.equal(isUuid("00000000-0000-4000-8000-0000000e2e00"), true);
  assert.equal(isUuid("f1"), false);
});
