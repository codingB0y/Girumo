import assert from "node:assert/strict";
import { anchorValues, copyKeys, missingFields, renderCopy, resolveStepDate } from "./render";
import { getFunnelTemplate, type FunnelStep } from "./templates";

const passo = (at: FunnelStep["at"]): FunnelStep => ({
  id: "x", label: "x", at, kind: "texto", fields: [], mentionAll: false, wantsMedia: false, copy: "",
});

// Ancora: sabado 10/10/2026 20:00, hora local.
const live = new Date(2026, 9, 10, 20, 0);

// Hora fixa em outro dia.
assert.deepEqual(resolveStepDate(live, passo({ days: -1, time: "19:00" })), new Date(2026, 9, 9, 19, 0));
assert.deepEqual(resolveStepDate(live, passo({ days: 1, time: "10:00" })), new Date(2026, 9, 11, 10, 0));
// Minutos relativos a hora da ancora.
assert.deepEqual(resolveStepDate(live, passo({ days: 0, minutes: -15 })), new Date(2026, 9, 10, 19, 45));
assert.deepEqual(resolveStepDate(live, passo({ days: 0, minutes: 90 })), new Date(2026, 9, 10, 21, 30));
// Virada de mes e de ano.
assert.deepEqual(resolveStepDate(new Date(2026, 9, 31, 6, 0), passo({ days: 1, time: "10:00" })), new Date(2026, 10, 1, 10, 0));
assert.deepEqual(resolveStepDate(new Date(2026, 11, 31, 6, 0), passo({ days: 2, time: "10:00" })), new Date(2027, 0, 2, 10, 0));
// A ancora nao e mutada.
assert.equal(live.getTime(), new Date(2026, 9, 10, 20, 0).getTime());

// O roteiro real da live, do inicio ao fim, sai em ordem.
const etapas = getFunnelTemplate("live")!.steps.map((s) => resolveStepDate(live, s).getTime());
assert.deepEqual([...etapas].sort((a, b) => a - b), etapas);

// Valores da ancora para a copy.
const a = anchorValues(live);
assert.ok(a.dia.includes("10/10"), a.dia);
assert.ok(/s[aá]bado/i.test(a.dia), a.dia);
assert.equal(a.hora, "20h");
assert.equal(anchorValues(new Date(2026, 9, 10, 19, 30)).hora, "19h30");

// renderCopy troca todas as chaves, inclusive repetidas e com espaco.
assert.equal(
  renderCopy("{loja} e {loja}: {link da live}", { loja: "Mega", "link da live": "https://x" }),
  "Mega e Mega: https://x",
);
// Campo faltando ou vazio lanca com o nome da chave.
assert.throws(() => renderCopy("oi {peça}", {}), /peça/);
assert.throws(() => renderCopy("oi {peça}", { "peça": "  " }), /peça/);
// Sem chaves, devolve igual.
assert.equal(renderCopy("sem chave", {}), "sem chave");

// missingFields devolve so os obrigatorios vazios, na ordem da etapa.
const grade = getFunnelTemplate("grade-do-dia")!.steps[0];
assert.deepEqual(missingFields(grade, { "peça": "vestido", "preço": "", grade: "P ao GG" }), ["preço", "quantidade"]);
assert.deepEqual(missingFields(grade, { "peça": "v", "preço": "p", grade: "g", quantidade: "120" }), []);

// copyKeys lista as chaves na ordem em que aparecem.
assert.deepEqual(copyKeys("{dia} {loja} {dia}"), ["dia", "loja", "dia"]);

console.log("funnels/render tests passed");
