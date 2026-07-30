import assert from "node:assert/strict";
import { CAMPAIGN_PRESETS, getCampaignPreset, resolvePresetName } from "./campaign-presets";

// Os 5 objetivos do plano existem, com ids únicos.
assert.equal(CAMPAIGN_PRESETS.length, 5);
const ids = CAMPAIGN_PRESETS.map((p) => p.id);
assert.deepEqual([...new Set(ids)].sort(), [...ids].sort(), "ids duplicados");
for (const id of ["novidade", "girar-estoque", "reativacao", "reposicao", "zero"]) {
  assert.ok(ids.includes(id as (typeof ids)[number]), `falta preset ${id}`);
}

// "Do zero" não pré-preenche nada.
const zero = getCampaignPreset("zero")!;
assert.equal(zero.message, null);
assert.equal(zero.nameTemplate, "");

// Presets reais têm mensagem-modelo.
for (const p of CAMPAIGN_PRESETS.filter((x) => x.id !== "zero")) {
  assert.ok(p.message && p.message.length > 0, `${p.id} sem mensagem`);
  assert.ok(p.nameTemplate.includes("{mes}"), `${p.id} sem {mes} no nome`);
}

// Resolução do nome troca {mes}.
assert.equal(resolvePresetName(getCampaignPreset("reativacao")!, "julho"), "Reativação julho");
assert.equal(resolvePresetName(zero, "julho"), "");

// id desconhecido → undefined.
assert.equal(getCampaignPreset("nope"), undefined);

console.log("campaign-presets tests passed");
