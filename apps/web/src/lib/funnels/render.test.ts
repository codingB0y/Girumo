import assert from "node:assert/strict";
import { anchorValues, copyKeys, missingFields, missingKeys, renderCopy, resolveStepDate } from "./render";
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

// Ramo `time` zera segundos/ms da ancora (comportamento atual, travado por teste).
const comSegundos = new Date(2026, 9, 10, 20, 0, 37, 500);
assert.deepEqual(resolveStepDate(comSegundos, passo({ days: 0, time: "06:00" })), new Date(2026, 9, 10, 6, 0, 0, 0));

// Valores da ancora para a copy.
const a = anchorValues(live);
assert.ok(a.dia.includes("10/10"), a.dia);
assert.ok(/s[aá]bado/i.test(a.dia), a.dia);
assert.equal(a.hora, "20h");
assert.equal(anchorValues(new Date(2026, 9, 10, 19, 30)).hora, "19h30");
// Minuto de um digito usa padStart (senao "20h5" em vez de "20h05").
assert.equal(anchorValues(new Date(2026, 9, 10, 20, 5)).hora, "20h05");

// renderCopy troca todas as chaves, inclusive repetidas e com espaco.
assert.equal(
  renderCopy("{loja} e {loja}: {link da live}", { loja: "Mega", "link da live": "https://x" }),
  "Mega e Mega: https://x",
);
// Campo faltando ou vazio lanca com o nome da chave.
assert.throws(() => renderCopy("oi {peça}", {}), /peça/);
assert.throws(() => renderCopy("oi {peça}", { "peça": "  " }), /peça/);
// Valor que abre frase ganha maiuscula ({dia} vem "sábado, 10/10"); no meio da frase, nao.
const dia = { dia: "sábado, 10/10", loja: "mega" };
assert.equal(renderCopy("{dia} tem live.", dia), "Sábado, 10/10 tem live.");
assert.equal(renderCopy("Oi! {dia} tem. Já {dia}?\n{dia}", dia), "Oi! Sábado, 10/10 tem. Já sábado, 10/10?\nSábado, 10/10");
assert.equal(renderCopy("Black da {loja} é {dia}.", dia), "Black da mega é sábado, 10/10.");
// Sem chaves, devolve igual.
assert.equal(renderCopy("sem chave", {}), "sem chave");

// missingFields devolve so os obrigatorios vazios, na ordem da etapa.
const grade = getFunnelTemplate("grade-do-dia")!.steps[0];
assert.deepEqual(missingFields(grade, { "peça": "vestido", "preço": "", grade: "P ao GG" }), ["preço", "quantidade"]);
assert.deepEqual(missingFields(grade, { "peça": "v", "preço": "p", grade: "g", quantidade: "120" }), []);
// Campo so-espacos tambem conta como faltando (mesmo trim de renderCopy).
assert.deepEqual(missingFields(grade, { "peça": "vestido", "preço": "   ", grade: "P ao GG", quantidade: "120" }), ["preço"]);

// copyKeys lista as chaves na ordem em que aparecem (entrada assimetrica, nao palindromo).
assert.deepEqual(copyKeys("{loja} {dia} {hora}"), ["loja", "dia", "hora"]);

// missingKeys: chave repetida aparece uma vez so; preenchida nao aparece.
assert.deepEqual(missingKeys("{loja} e {loja} com {link}", { link: "https://x" }), ["loja"]);
// So-espacos conta como vazia (mesmo trim de renderCopy).
assert.deepEqual(missingKeys("{loja}", { loja: "   " }), ["loja"]);
// Copy sem chave nenhuma.
assert.deepEqual(missingKeys("sem chave", {}), []);
// Tudo preenchido.
assert.deepEqual(missingKeys("{loja} {nicho}", { loja: "Mega", nicho: "moda" }), []);

// O ponto: copy real de roteiro, campos da etapa preenchidos, {loja} vazia.
// missingFields aprova (so olha step.fields) e renderCopy lanca -- e o buraco
// pelo qual o botao "Agendar" passava com a loja em branco.
const abriu = getFunnelTemplate("grade-do-dia")!.steps[0];
const semLoja = { "peça": "vestido", "preço": "R$ 39", grade: "P ao GG", quantidade: "120" };
assert.deepEqual(missingFields(abriu, semLoja), []);
assert.deepEqual(missingKeys(abriu.copy, semLoja), ["loja"]);
assert.throws(() => renderCopy(abriu.copy, semLoja), /loja/);
// Com a loja preenchida, missingKeys esvazia e renderCopy passa -- os dois concordam.
const comLoja = { ...semLoja, loja: "Mega Stock" };
assert.deepEqual(missingKeys(abriu.copy, comLoja), []);
assert.ok(renderCopy(abriu.copy, comLoja).includes("Mega Stock"));

console.log("funnels/render tests passed");
