import { strict as assert } from "node:assert";
import { test } from "node:test";
import { candidatoSlugMestre } from "./master-link";

test("primeira tentativa usa o slug base puro", () => {
  assert.equal(candidatoSlugMestre("clientes-vip", 0, () => 0.5), "clientes-vip");
});

test("tentativas seguintes levam sufixo de 4 caracteres base36", () => {
  const slug = candidatoSlugMestre("clientes-vip", 1, () => 0.123456789);
  assert.equal(slug, `clientes-vip-${(0.123456789).toString(36).slice(2, 6)}`);
  assert.match(slug, /^clientes-vip-[a-z0-9]{4}$/);
});
