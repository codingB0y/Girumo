import assert from "node:assert/strict";
import { clicksByCampaign, clicksForCampaign } from "./click-attribution";

const campanhas = [
  { id: "c1", name: "Saldão Julho" },
  { id: "c2", name: "Novidade" },
];

// --- atribuição por ID (o ponto do PR) -------------------------------------

// Link com ID vai pra campanha certa MESMO com o nome desatualizado.
assert.equal(
  clicksByCampaign([{ campaignGroupId: "c1", campaignName: "Nome Antigo", clicks: 10 }], campanhas).get("c1"),
  10,
);

// Renomear a campanha não zera nada: o vínculo é o ID.
const renomeadas = [{ id: "c1", name: "Saldão Julho — Reloaded" }, campanhas[1]];
assert.equal(
  clicksByCampaign([{ campaignGroupId: "c1", campaignName: "Saldão Julho", clicks: 7 }], renomeadas).get("c1"),
  7,
);

// --- fallback por nome (links legados, sem ID) -----------------------------

assert.equal(clicksByCampaign([{ campaignName: "Saldão Julho", clicks: 4 }], campanhas).get("c1"), 4);
// Case e espaço não podem quebrar a ponte legada.
assert.equal(clicksByCampaign([{ campaignName: "  saldão julho ", clicks: 3 }], campanhas).get("c1"), 3);

// Soma links legados e novos na mesma campanha.
assert.equal(
  clicksByCampaign(
    [
      { campaignGroupId: "c1", clicks: 5 },
      { campaignName: "Saldão Julho", clicks: 2 },
    ],
    campanhas,
  ).get("c1"),
  7,
);

// --- casos que NÃO podem atribuir ------------------------------------------

// ID de campanha que não existe mais não cai no nome — adivinhar traria o bug de volta.
assert.equal(
  clicksByCampaign([{ campaignGroupId: "sumiu", campaignName: "Saldão Julho", clicks: 9 }], campanhas).get("c1"),
  undefined,
);

// Nome que não bate com nada é ignorado.
assert.equal(clicksByCampaign([{ campaignName: "Outra", clicks: 5 }], campanhas).size, 0);

// Link sem vínculo nenhum é ignorado.
assert.equal(clicksByCampaign([{ clicks: 5 }], campanhas).size, 0);

// Nome duplicado entre campanhas é ambíguo: não atribui a nenhuma.
const ambiguas = [{ id: "a", name: "Igual" }, { id: "b", name: "igual" }];
assert.equal(clicksByCampaign([{ campaignName: "Igual", clicks: 8 }], ambiguas).size, 0);
// Mas com ID explícito continua funcionando mesmo com nome duplicado.
assert.equal(clicksByCampaign([{ campaignGroupId: "b", campaignName: "Igual", clicks: 8 }], ambiguas).get("b"), 8);

// Zero e nulo não criam entrada.
assert.equal(clicksByCampaign([{ campaignGroupId: "c1", clicks: 0 }], campanhas).size, 0);
assert.equal(clicksByCampaign([{ campaignGroupId: "c1", clicks: null }], campanhas).size, 0);

// --- tela de detalhe --------------------------------------------------------

const links = [
  { campaignGroupId: "c1", clicks: 6 },
  { campaignGroupId: "c2", clicks: 99 },
  { campaignName: "Saldão Julho", clicks: 1 },
];
// Só conta o que é da campanha pedida.
assert.equal(clicksForCampaign(links, campanhas[0]), 7);
assert.equal(clicksForCampaign(links, campanhas[1]), 99);

console.log("click-attribution tests passed");
