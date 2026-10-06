import test from "node:test";
import assert from "node:assert/strict";
import { cn } from "./utils";

// Os tamanhos numéricos (text-12 … text-64) vêm do @theme em painel-vitrine.css.
// O tailwind-merge não os conhece de fábrica e os lia como cor — então um
// `text-<cor>` posterior apagava o tamanho em silêncio.
test("mantém o tamanho numérico quando uma cor de texto vem depois", () => {
  assert.equal(
    cn("text-13 font-semibold", "text-danger-700"),
    "text-13 font-semibold text-danger-700",
  );
});

test("dois tamanhos numéricos conflitam entre si: o último vence", () => {
  assert.equal(cn("text-13", "text-15"), "text-15");
});

test("tamanho numérico e tamanho nativo são o mesmo grupo", () => {
  assert.equal(cn("text-sm", "text-13"), "text-13");
  assert.equal(cn("text-13", "text-sm"), "text-sm");
});
