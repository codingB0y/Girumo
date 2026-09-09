import assert from "node:assert/strict";
import { test } from "node:test";
import { templateExampleForSegment } from "./content-packs-v3";
import { NEUTRAL_EXAMPLES } from "./content-packs-v3-neutral";
import { MERCADO_EXAMPLES } from "./content-packs-v3-mercado";
import { validateContentV3 } from "./content-v3";
import { instantiateTemplate } from "./templates-v3";
import { newDraftV3 } from "./editor-v3";
import { TEMPLATE_KEYS, TEMPLATES_V3 } from "./templates-v3";

const NOW = new Date("2026-09-01T12:00:00Z");
const PACKS = { neutro: NEUTRAL_EXAMPLES, mercado: MERCADO_EXAMPLES } as const;

test("every pack covers every template key", () => {
  for (const [nome, pack] of Object.entries(PACKS)) {
    for (const key of TEMPLATE_KEYS) {
      assert.ok(pack[key], `pack ${nome} não tem exemplo pra ${key}`);
    }
  }
});

test("every pack, instantiated, is valid content (ends_at das contagens regressivas resolvido por instantiateTemplate, como no pack original de moda)", () => {
  for (const nome of Object.keys(PACKS) as Array<keyof typeof PACKS>) {
    const segmento = nome === "mercado" ? "mercado" : "beleza";
    for (const key of TEMPLATE_KEYS) {
      const errors = validateContentV3(instantiateTemplate(key, NOW, segmento));
      assert.deepEqual(errors, [], `pack ${nome} / ${key}: ${errors.join("; ")}`);
    }
  }
});

test("every pack keeps the same section structure (type/variant/enabled) as the base template — só a data muda", () => {
  for (const [nome, pack] of Object.entries(PACKS)) {
    for (const key of TEMPLATE_KEYS) {
      const base = TEMPLATES_V3[key].sections;
      const dado = pack[key].sections.map(({ type, variant, enabled }) => ({ type, variant, enabled }));
      assert.deepEqual(dado, base, `pack ${nome} / ${key} tem estrutura diferente do template base`);
    }
  }
});

test("templateExampleForSegment: moda_atacado usa o example original (null = sem override)", () => {
  assert.equal(templateExampleForSegment("vitrine", "moda_atacado"), null);
});

test("templateExampleForSegment: mercado usa o pack de mercado", () => {
  assert.equal(templateExampleForSegment("vitrine", "mercado"), MERCADO_EXAMPLES.vitrine);
});

test("templateExampleForSegment: null, undefined e segmento desconhecido caem no pack neutro", () => {
  assert.equal(templateExampleForSegment("vitrine", null), NEUTRAL_EXAMPLES.vitrine);
  assert.equal(templateExampleForSegment("vitrine", undefined), NEUTRAL_EXAMPLES.vitrine);
  assert.equal(templateExampleForSegment("vitrine", "beleza"), NEUTRAL_EXAMPLES.vitrine);
});

test("instantiateTemplate troca o texto pelo segmento sem tocar contagem regressiva", () => {
  const mercado = instantiateTemplate("promo-relampago", NOW, "mercado");
  assert.equal(mercado.store_name, "Mercado Bom Preço");
  const urgency = mercado.sections.find((s) => s.type === "urgency");
  assert.ok(urgency && urgency.type === "urgency" && urgency.variant === "countdown");
  assert.ok(urgency.data.ends_at, "countdown continua sendo resolvido a partir de now");

  const moda = instantiateTemplate("promo-relampago", NOW, "moda_atacado");
  assert.equal(moda.store_name, "Mega Stock Atacado");

  const semSegmento = instantiateTemplate("promo-relampago", NOW);
  assert.equal(semSegmento.store_name, "Estoque Novo Atacado", "sem segmento cai no pack neutro, não no moda_atacado");
});

test("newDraftV3 propaga o segmento pro conteúdo inicial do rascunho", () => {
  const draft = newDraftV3("vitrine", NOW, "mercado");
  assert.equal(draft.content.store_name, "Vitrine do Mercado");
});
