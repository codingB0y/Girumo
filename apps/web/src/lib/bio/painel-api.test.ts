// apps/web/src/lib/bio/painel-api.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { motivoDoSlug, periodoDoRelatorio } from "./painel-api";

test("slug: formato e tamanho (3 a 40), reservado (lista do §2 e qualquer um com girumo ou hubflow)", () => {
  const formato = ["", "ab", "a".repeat(41), "a".repeat(10_000), "Minha-Loja", "minha loja", "atelie_ouro", "-atelie", "atelie-", "atelie--ouro", "ateliê"];
  for (const slug of formato) assert.equal(motivoDoSlug(slug), "formato", slug.slice(0, 20));
  for (const slug of ["admin", "api", "bio", "painel", "girumo", "loja-girumo", "hubflow-moda"]) {
    assert.equal(motivoDoSlug(slug), "reservado", slug);
  }
  for (const slug of ["abc", "atelie-ouro-prata", "a".repeat(40), "loja-2026"]) assert.equal(motivoDoSlug(slug), null, slug);
});

test("relatório: os últimos 7 ou 30 dias contando hoje, no fuso de Brasília; o resto é recusado", () => {
  // 02:00 UTC de 19/10 ainda é 18/10 em Brasília (UTC-3).
  const agora = new Date("2026-10-19T02:00:00Z");
  assert.deepEqual(periodoDoRelatorio("7", agora), { desde: "2026-10-12", ate: "2026-10-18" });
  assert.deepEqual(periodoDoRelatorio("30", agora), { desde: "2026-09-19", ate: "2026-10-18" });
  for (const dias of [null, "", "14", "7.0", " 7", "30d", "-7"]) assert.equal(periodoDoRelatorio(dias, agora), null, String(dias));
});
