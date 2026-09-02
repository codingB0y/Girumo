import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldErrorsV3, newDraftV3, patchSection, toSavePayload, videoLinkOf } from "./editor-v3";
import { validateContentV3 } from "./content-v3";
import { parseVideoUrl } from "./video";

const NOW = new Date("2026-09-01T12:00:00Z");

test("a new draft is the template example, valid as-is, with empty page columns", () => {
  const draft = newDraftV3("promo-relampago", NOW);
  assert.deepEqual(validateContentV3(draft.content), []);
  assert.equal(draft.target_group_url, "");
  assert.equal(draft.content.template, "promo-relampago");
});

test("patchSection returns a new content and leaves the other sections untouched", () => {
  const { content } = newDraftV3("evento-ao-vivo", NOW);
  const next = patchSection(content, "faq", { enabled: false, data: { title: "Dúvidas" } });
  assert.notEqual(next, content);
  const faq = next.sections.find((s) => s.type === "faq");
  assert.ok(faq && faq.type === "faq");
  assert.equal(faq.enabled, false);
  assert.equal(faq.data.title, "Dúvidas");
  assert.equal(faq.data.items.length, 4, "the other fields of the section stay");
  assert.equal(next.sections[0], content.sections[0], "hero is the same object");
});

test("patchSection swaps the variant without touching the data", () => {
  const { content } = newDraftV3("evento-ao-vivo", NOW);
  const next = patchSection(content, "deliverables", { variant: "numbers" });
  const d = next.sections.find((s) => s.type === "deliverables");
  assert.ok(d && d.type === "deliverables");
  assert.equal(d.variant, "numbers");
  assert.equal(d.data.items.length, 4);
});

test("toSavePayload turns empty columns into null and keeps the content", () => {
  const draft = { ...newDraftV3("promo-relampago", NOW), target_group_url: "  ", ga4_id: "G-1" };
  const payload = toSavePayload(draft);
  assert.equal(payload.target_group_url, null);
  assert.equal(payload.campaign_slug, null);
  assert.equal(payload.ga4_id, "G-1");
  assert.equal(payload.content, draft.content);
});

test("fieldErrorsV3 keys server details by the field path", () => {
  const errors = fieldErrorsV3(["hero.headline é obrigatório.", "faq.items[1].a excede 400 caracteres."]);
  assert.deepEqual(Object.keys(errors), ["hero.headline", "faq.items[1].a"]);
});

test("videoLinkOf rebuilds a link that parseVideoUrl accepts, for both providers", () => {
  for (const video of [{ provider: "youtube", id: "dQw4w9WgXcQ" }, { provider: "vimeo", id: "123456" }] as const) {
    assert.deepEqual(parseVideoUrl(videoLinkOf(video)), video);
  }
});
