import assert from "node:assert/strict";
import {
  ANCHOR_KEYS,
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
    const permitidas = new Set<string>([...s.fields, ...STORE_KEYS, ...ANCHOR_KEYS, ...CAMPAIGN_KEYS]);
    for (const [, chave] of s.copy.matchAll(/\{([^}]+)\}/g)) {
      assert.ok(permitidas.has(chave), `${t.id}/${s.id}: chave {${chave}} sem campo`);
    }
    // Negrito e do WhatsApp, nao markdown.
    assert.ok(!s.copy.includes("**"), `${t.id}/${s.id}: negrito markdown`);
  }
}

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
