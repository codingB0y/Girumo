import assert from "node:assert/strict";
import { countCampaignEntries, entriesPerClick, type EntryLead } from "./campaign-entries";

const pool = ["a@g.us", "b@g.us"];
const leads: EntryLead[] = [
  { sourceGroupId: "a@g.us", enteredAt: "2026-08-05T10:00:00.000Z" },
  { sourceGroupId: "a@g.us", enteredAt: "2026-08-09T10:00:00.000Z" },
  { sourceGroupId: "b@g.us", enteredAt: "2026-08-10T10:00:00.000Z" },
  { sourceGroupId: "fora@g.us", enteredAt: "2026-08-10T10:00:00.000Z" }, // outro grupo
];

// --- contagem ---------------------------------------------------------------

// Só conta quem entrou em grupo DA campanha.
assert.equal(countCampaignEntries(leads, pool), 3);
// Campanha sem grupos não tem entrada.
assert.equal(countCampaignEntries(leads, []), 0);
// Lead sem grupo de origem não entra na conta.
assert.equal(countCampaignEntries([{ sourceGroupId: null, enteredAt: "2026-08-10T10:00:00.000Z" }], pool), 0);

// Corte por data descarta quem entrou antes da campanha existir.
assert.equal(countCampaignEntries(leads, pool, { since: "2026-08-08T00:00:00.000Z" }), 2);
assert.equal(countCampaignEntries(leads, pool, { since: "2026-08-11T00:00:00.000Z" }), 0);
// Sem corte, tudo que é do pool conta.
assert.equal(countCampaignEntries(leads, pool, { since: null }), 3);

// Entrada sem data fica FORA quando há corte — datar por otimismo inflaria.
const semData: EntryLead[] = [{ sourceGroupId: "a@g.us", enteredAt: null }];
assert.equal(countCampaignEntries(semData, pool), 1);
assert.equal(countCampaignEntries(semData, pool, { since: "2026-08-01T00:00:00.000Z" }), 0);
// Data corrompida também não vira entrada datada.
assert.equal(
  countCampaignEntries([{ sourceGroupId: "a@g.us", enteredAt: "nao-e-data" }], pool, { since: "2026-08-01T00:00:00.000Z" }),
  0,
);

// --- taxa -------------------------------------------------------------------

assert.equal(entriesPerClick(5, 10), 50);
assert.equal(entriesPerClick(1, 3), 33);
// Sem clique não há denominador: null, não 0% (que leria "ninguém converteu").
assert.equal(entriesPerClick(4, 0), null);
assert.equal(entriesPerClick(0, 0), null);
// Zero entrada com clique é 0% de verdade.
assert.equal(entriesPerClick(0, 8), 0);
// Teto: entrada não prova origem no link, então a razão pode passar de 1
// legitimamente — mas passar de 100% na tela denunciaria a métrica.
assert.equal(entriesPerClick(30, 10), 100);
assert.equal(entriesPerClick(10, 10), 100);

console.log("campaign-entries tests passed");
