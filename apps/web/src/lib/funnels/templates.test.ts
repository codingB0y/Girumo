import assert from "node:assert/strict";
import {
  ANCHOR_KEYS,
  OPENING_KEYS,
  CAMPAIGN_KEYS,
  FUNNEL_TEMPLATES,
  FUNNEL_TEMPLATE_IDS,
  STORE_KEYS,
  blackFridayAtacado,
  getFunnelTemplate,
  type FunnelStep,
} from "./templates";

// Os 4 roteiros do spec, ids unicos.
assert.deepEqual(
  FUNNEL_TEMPLATES.map((t) => t.id),
  ["grade-do-dia", "evento-2-dias", "live", "black-friday-atacado"],
);
assert.deepEqual([...FUNNEL_TEMPLATE_IDS], FUNNEL_TEMPLATES.map((t) => t.id));

// Contagem de etapas por roteiro (spec 3.1 a 3.4).
const contagem = Object.fromEntries(FUNNEL_TEMPLATES.map((t) => [t.id, t.steps.length]));
assert.deepEqual(contagem, { "grade-do-dia": 3, "evento-2-dias": 7, live: 4, "black-friday-atacado": 7 });

// So a live precisa de hora na ancora.
assert.deepEqual(
  FUNNEL_TEMPLATES.filter((t) => t.anchorNeedsTime).map((t) => t.id),
  ["live"],
);

const minutosDoDia = (s: FunnelStep): number => {
  if (s.at.time) {
    const [h, m] = s.at.time.split(":").map(Number);
    return s.at.days * 1440 + h * 60 + m;
  }
  return s.at.days * 1440 + (s.at.minutes ?? 0);
};

for (const t of FUNNEL_TEMPLATES) {
  // Ids de etapa unicos dentro do roteiro.
  const ids = t.steps.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `${t.id}: etapa duplicada`);

  // Etapas em ordem cronologica (relativas a ancora).
  for (let i = 1; i < t.steps.length; i += 1) {
    assert.ok(
      minutosDoDia(t.steps[i]) > minutosDoDia(t.steps[i - 1]),
      `${t.id}: ${t.steps[i].id} nao vem depois de ${t.steps[i - 1].id}`,
    );
  }

  for (const s of t.steps) {
    // Uma etapa tem `time` OU `minutes`, nunca os dois, nunca nenhum.
    assert.ok((s.at.time === undefined) !== (s.at.minutes === undefined), `${t.id}/${s.id}: at invalido`);
    // Etapa com minutos relativos so existe em roteiro com hora na ancora.
    if (s.at.minutes !== undefined) assert.ok(t.anchorNeedsTime, `${t.id}/${s.id}: minutos sem hora na ancora`);
    // Relampago pede quantidade (vira slots).
    if (s.kind === "relampago") assert.ok(s.fields.includes("quantidade"), `${t.id}/${s.id}: relampago sem quantidade`);
    // Etapa link carrega {link} ou {link da live}; nenhuma outra carrega.
    const temLink = s.copy.includes("{link}") || s.copy.includes("{link da live}");
    assert.equal(temLink, s.kind === "link", `${t.id}/${s.id}: link fora de etapa link`);
    // Toda chave da copy e campo da etapa, da loja, da ancora ou da campanha.
    const permitidas = new Set<string>([...s.fields, ...STORE_KEYS, ...ANCHOR_KEYS, ...OPENING_KEYS, ...CAMPAIGN_KEYS]);
    for (const [, chave] of s.copy.matchAll(/\{([^}]+)\}/g)) {
      assert.ok(permitidas.has(chave), `${t.id}/${s.id}: chave {${chave}} sem campo`);
    }
    // Negrito e do WhatsApp, nao markdown.
    assert.ok(!s.copy.includes("**"), `${t.id}/${s.id}: negrito markdown`);
  }
}

// Fingerprint por roteiro, transcrito do spec (docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md,
// seção 3) — NÃO gerado a partir do módulo. Cobre label, dia/hora, tipo, mentionAll, wantsMedia e a copy
// caractere a caractere; as asserções estruturais acima não veem esses campos.
type Fingerprint = [
  label: string,
  days: number,
  time: string | undefined,
  minutes: number | undefined,
  kind: string,
  mentionAll: boolean,
  wantsMedia: boolean,
  copy: string,
];

const fingerprint = (s: FunnelStep): Fingerprint => [
  s.label,
  s.at.days,
  s.at.time,
  s.at.minutes,
  s.kind,
  s.mentionAll,
  s.wantsMedia,
  s.copy,
];

const fingerprints = (id: string): Fingerprint[] =>
  (getFunnelTemplate(id)?.steps ?? []).map(fingerprint);

// 3.1 Grade do dia
assert.deepEqual(fingerprints("grade-do-dia"), [
  ["Grade de hoje", 0, "06:00", undefined, "relampago", true, true,
    "Bom dia! Grade de hoje da {loja}: {peça} por {preço} no atacado, grade {grade}. Só {quantidade} peças. Quer? Manda *EU QUERO* aqui no grupo que eu separo a sua."],
  ["Vagas de hoje", 0, "06:12", undefined, "link", false, false,
    "Pra quem ainda não entrou: o link de pedido da {loja} é este, com as vagas de hoje: {link}"],
  ["Últimas da grade", 0, "12:00", undefined, "texto", false, false,
    "Sobrou pouca coisa da grade de hoje. Quem mandou EU QUERO já está na fila; quem ficou de fora ainda pega o que restou por aqui."],
]);

// 3.2 Evento de 2 dias
assert.deepEqual(fingerprints("evento-2-dias"), [
  ["Vem aí", -2, "19:00", undefined, "midia", false, true,
    "{dia} tem evento de 2 dias da {loja}, só pra quem está nos grupos: {nicho} com preço de atacado que não vai pro site. Guarda a data."],
  ["Prévia", -1, "19:00", undefined, "midia", false, true,
    "Amanhã {abertura} abre. Prévia: {peça} a partir de {preço}, grade {grade}. Quem estiver no grupo às {abertura} pega primeiro."],
  ["Abriu · dia 1", 0, "06:00", undefined, "relampago", true, true,
    "Abriu! Dia 1 do evento da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem."],
  ["Ainda dá tempo", 0, "12:00", undefined, "texto", false, false,
    "Meio-dia e o evento segue. O que saiu de manhã não volta; o que sobrou está por aqui."],
  ["Abriu · dia 2", 1, "06:00", undefined, "relampago", true, true,
    "Dia 2! Nova grade da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO*."],
  ["Última chamada", 1, "18:00", undefined, "link", true, false,
    "Última chamada do evento. Pedido pelo link até hoje à noite: {link}"],
  ["Sobras", 2, "10:00", undefined, "link", false, false,
    "Sobras do evento com o mesmo preço, enquanto durar: {link}"],
]);

// 3.3 Lançamento de live
assert.deepEqual(fingerprints("live"), [
  ["Prévia da grade", -1, "19:00", undefined, "midia", false, true,
    "Amanhã {hora} tem live da {loja}! Prévia da grade de {nicho}: {peça} a partir de {preço} no atacado, grade {grade}, {quantidade} peças. Quem estiver ao vivo leva condição exclusiva."],
  ["Entra agora", 0, undefined, -15, "link", true, false,
    "Tô entrando ao vivo em 15 min! Entra aqui: {link da live}. Pedido é pelo grupo, na condição da live."],
  ["Grade da live", 0, undefined, 90, "relampago", false, true,
    "Grade da live liberada: {peça} {preço}, {grade}. Só {quantidade} peças. Manda *EU QUERO* aqui que eu separo a sua."],
  ["Sobras da live", 1, "10:00", undefined, "link", false, false,
    "Sobrou da live e ainda está na condição de ontem. Pedido por aqui: {link}"],
]);

// 3.4 Black Friday do atacado
assert.deepEqual(fingerprints("black-friday-atacado"), [
  ["Vem aí", -7, "19:00", undefined, "midia", false, true,
    "Black Friday do atacado da {loja} é {dia}. Antes da BF das lojas, pra você revender na BF delas. Só nos grupos."],
  ["Prévia", -3, "19:00", undefined, "midia", false, true,
    "Prévia da Black do atacado: {peça} vai sair por {preço}, grade {grade}. Na {dia} às {abertura}."],
  ["Véspera", -1, "19:00", undefined, "texto", true, false,
    "Amanhã {abertura}. A grade sai aqui no grupo primeiro; quem mandar EU QUERO cedo pega."],
  ["Abriu", 0, "06:00", undefined, "relampago", true, true,
    "Abriu a Black do atacado da {loja}! {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem."],
  ["Reforço", 0, "12:00", undefined, "texto", false, false,
    "Metade do dia e metade da grade já foi. O que sobrou continua no mesmo preço até hoje à noite."],
  ["Última chamada", 0, "18:00", undefined, "link", true, false,
    "Última chamada da Black do atacado. Pedido pelo link até meia-noite: {link}"],
  ["Sobras", 1, "10:00", undefined, "link", false, false,
    "Sobras da Black no mesmo preço, enquanto durar: {link}"],
]);

// getFunnelTemplate.
assert.equal(getFunnelTemplate("live")?.label, "Lançamento de live");
assert.equal(getFunnelTemplate("nope"), undefined);

// BF do atacado: 3 semanas antes da ultima sexta de novembro. 2026: BF 27/11 -> 06/11.
const sugerida = blackFridayAtacado(new Date(2026, 8, 19));
assert.equal(sugerida.getFullYear(), 2026);
assert.equal(sugerida.getMonth(), 10);
assert.equal(sugerida.getDate(), 6);
// Ja passou este ano -> ano que vem (2027: BF 26/11 -> 05/11).
const proxima = blackFridayAtacado(new Date(2026, 11, 1));
assert.equal(proxima.getFullYear(), 2027);
assert.equal(proxima.getDate(), 5);

console.log("funnels/templates tests passed");
