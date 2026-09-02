import test from "node:test";
import assert from "node:assert/strict";
import { ENTRADA_DEFAULTS } from "@/lib/campaigns/settings";
import { chipLabels } from "./config-chips";

test("sem integrações o chip do pixel não aparece", () => {
  assert.equal(chipLabels(ENTRADA_DEFAULTS).length, 3);
});

test("chip do pixel: últimos 4 quando configurado, aviso quando não", () => {
  assert.ok(chipLabels(ENTRADA_DEFAULTS, { meta: { pixel_id: "1234563456" } }).includes("Pixel · …3456"));
  assert.ok(chipLabels(ENTRADA_DEFAULTS, { meta: { pixel_id: "" } }).includes("Pixel · não configurado"));
});

test("o chip do pixel entra por último, depois de encerramento", () => {
  const chips = chipLabels({ ...ENTRADA_DEFAULTS, encerra_em: "2026-09-30" }, { meta: { pixel_id: "1234563456" } });
  assert.equal(chips.at(-1), "Pixel · …3456");
  assert.ok(chips.includes("Encerra em 30/09"));
});
