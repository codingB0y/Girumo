import test from "node:test";
import assert from "node:assert/strict";
import { formatPhoneBR } from "./phone";

test("formats a BR mobile number from the WhatsApp digit string", () => {
  assert.equal(formatPhoneBR("5511987654321"), "+55 11 98765-4321");
});

test("formats a BR landline (8-digit) number", () => {
  assert.equal(formatPhoneBR("551132654321"), "+55 11 3265-4321");
});

test("strips existing punctuation before formatting", () => {
  assert.equal(formatPhoneBR("+55 (11) 98765-4321"), "+55 11 98765-4321");
});

test("falls back to a plain international format for non-BR numbers", () => {
  assert.equal(formatPhoneBR("14155552671"), "+14155552671");
});

test("returns null when there is no number to show", () => {
  assert.equal(formatPhoneBR(null), null);
  assert.equal(formatPhoneBR(undefined), null);
  assert.equal(formatPhoneBR(""), null);
  assert.equal(formatPhoneBR("---"), null);
});
