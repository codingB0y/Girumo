import assert from "node:assert/strict";
import { test } from "node:test";
import { contentDimensions, contentSummary, toContentV3, validateContentV3 } from "./content-v3";
import { parseContentInput } from "./schema";
import { TEMPLATE_KEYS, instantiateTemplate } from "./templates-v3";

const NOW = new Date("2026-09-01T12:00:00Z");

function withPrints(content: ReturnType<typeof instantiateTemplate>) {
  const proof = content.sections.find((s) => s.type === "proof");
  if (proof && proof.type === "proof") {
    proof.enabled = true;
    proof.data.prints = [{ media_id: "m_print", alt: "Conversa" }];
  }
  return content;
}

test("every template example validates as-is and after instantiation", () => {
  for (const key of TEMPLATE_KEYS) {
    const content = instantiateTemplate(key, NOW);
    assert.deepEqual(validateContentV3(content), [], `${key} example must be valid`);
    const parsed = parseContentInput(content);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.schema_version, 3);
  }
});

test("countdown template gets a real ends_at relative to now", () => {
  const promo = instantiateTemplate("promo-relampago", NOW);
  const urgency = promo.sections.find((s) => s.type === "urgency");
  assert.ok(urgency && urgency.type === "urgency");
  assert.equal(urgency.variant, "countdown");
  assert.equal(urgency.data.ends_at, "2026-09-03T12:00:00.000Z");
});

test("countdown without a real date is refused", () => {
  const promo = instantiateTemplate("promo-relampago", NOW);
  const urgency = promo.sections.find((s) => s.type === "urgency");
  if (urgency && urgency.type === "urgency") delete urgency.data.ends_at;
  const errors = validateContentV3(promo);
  assert.ok(errors.some((e) => e.startsWith("urgency.ends_at")));
});

test("highlight must be a substring of the headline", () => {
  const content = instantiateTemplate("evento-ao-vivo", NOW);
  const hero = content.sections[0];
  if (hero.type === "hero") hero.data.highlight = "nao existe";
  assert.ok(validateContentV3(content).some((e) => e.startsWith("hero.highlight")));
});

test("a disabled section is not validated, an enabled one is", () => {
  const content = instantiateTemplate("evento-ao-vivo", NOW);
  const proof = content.sections.find((s) => s.type === "proof");
  assert.ok(proof && proof.type === "proof" && proof.enabled === false);
  assert.deepEqual(validateContentV3(content), []);
  proof.enabled = true; // prints ainda vazios
  assert.ok(validateContentV3(content).some((e) => e.startsWith("proof.prints")));
});

test("missing hero, unknown type and duplicated type are refused", () => {
  const content = withPrints(instantiateTemplate("evento-ao-vivo", NOW));
  const noHero = { ...content, sections: content.sections.filter((s) => s.type !== "hero") };
  assert.ok(validateContentV3(noHero).includes("hero é obrigatório."));

  const unknown = {
    ...content,
    sections: [...content.sections, { type: "banner", variant: "x", enabled: true, data: {} }],
  };
  assert.ok(validateContentV3(unknown).some((e) => e.includes("type desconhecido")));

  const dup = { ...content, sections: [...content.sections, content.sections[1]] };
  assert.ok(validateContentV3(dup).some((e) => e.includes("repetida")));
});

test("toContentV3 reorders by the template, drops unknown types and forces the hero on", () => {
  const content = withPrints(instantiateTemplate("evento-ao-vivo", NOW));
  const shuffled = {
    ...content,
    sections: [
      ...content.sections.slice(1).reverse(),
      { type: "banner", variant: "x", enabled: true, data: {} },
      { ...content.sections[0], enabled: false },
    ],
  } as unknown as Record<string, unknown>;
  const clean = toContentV3(shuffled);
  assert.deepEqual(
    clean.sections.map((s) => s.type),
    content.sections.map((s) => s.type),
  );
  assert.equal(clean.sections[0].enabled, true);
  assert.equal(clean.sections.some((s) => (s.type as string) === "banner"), false);
});

test("toContentV3 completes sections the client omitted as disabled and empty", () => {
  const content = instantiateTemplate("evento-ao-vivo", NOW);
  const onlyHero = { ...content, sections: [content.sections[0]] } as unknown as Record<string, unknown>;
  const clean = toContentV3(onlyHero);
  assert.equal(clean.sections.length, content.sections.length);
  const faq = clean.sections.find((s) => s.type === "faq");
  assert.ok(faq && faq.type === "faq");
  assert.equal(faq.enabled, false);
  assert.deepEqual(faq.data, { title: "", items: [] });
});

test("toContentV3 trims, drops extra keys and falls back to the template variant", () => {
  const content = instantiateTemplate("promo-relampago", NOW);
  const dirty = {
    ...content,
    store_name: "  Mega Stock  ",
    extra: "x",
    sections: content.sections.map((s) =>
      s.type === "urgency" ? { ...s, variant: "nope", data: { ...s.data, hacked: true } } : s,
    ),
  } as unknown as Record<string, unknown>;
  const clean = toContentV3(dirty);
  assert.equal(clean.store_name, "Mega Stock");
  assert.equal("extra" in clean, false);
  const urgency = clean.sections.find((s) => s.type === "urgency");
  assert.ok(urgency && urgency.type === "urgency");
  assert.equal(urgency.variant, "countdown");
  assert.equal("hacked" in urgency.data, false);
});

test("dimensions and summary come from the template and the hero", () => {
  const content = instantiateTemplate("evento-ao-vivo", NOW);
  assert.deepEqual(contentDimensions(content), {
    structure: "evento-ao-vivo",
    visualDirection: "impacto",
    modelVersion: 1,
  });
  const summary = contentSummary(content);
  assert.match(summary.headline, /lotar o grupo VIP/);
  assert.equal(summary.ogImage, null);
});
