import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTenantSlug, resolveDisplayName, safeNextPath, toSlug } from "./oauth-account";

test("toSlug strips accents and collapses separators", () => {
  assert.equal(toSlug("Atacado São João"), "atacado-sao-joao");
});

test("toSlug returns empty string when there is nothing sluggable", () => {
  assert.equal(toSlug("!!! ???"), "");
});

test("toSlug caps length at 48 characters", () => {
  const slug = toSlug("a".repeat(80));
  assert.equal(slug.length, 48);
});

test("resolveDisplayName prefers the provider full name", () => {
  const name = resolveDisplayName({
    fullName: "Maria da Silva",
    name: "maria",
    email: "maria@loja.com",
  });

  assert.equal(name, "Maria da Silva");
});

test("resolveDisplayName falls back to the legacy name field", () => {
  const name = resolveDisplayName({ fullName: "   ", name: "Maria", email: "maria@loja.com" });

  assert.equal(name, "Maria");
});

test("resolveDisplayName falls back to the email user when metadata is empty", () => {
  const name = resolveDisplayName({ email: "maria.silva@loja.com" });

  assert.equal(name, "maria.silva");
});

test("resolveDisplayName returns a generic name when the identity is empty", () => {
  assert.equal(resolveDisplayName({}), "Usuario");
  assert.equal(resolveDisplayName({ fullName: null, name: null, email: null }), "Usuario");
});

test("buildTenantSlug appends the first 8 chars of the auth user id", () => {
  const slug = buildTenantSlug("Maria da Silva", "9f8e7d6c-1234-4321-abcd-000000000000");

  assert.equal(slug, "maria-da-silva-9f8e7d6c");
});

test("buildTenantSlug uses a generic base when the name has no sluggable chars", () => {
  const slug = buildTenantSlug("???", "9f8e7d6c-1234-4321-abcd-000000000000");

  assert.equal(slug, "tenant-9f8e7d6c");
});

test("safeNextPath keeps internal paths untouched", () => {
  assert.equal(safeNextPath("/painel/grupos"), "/painel/grupos");
});

test("safeNextPath rejects absolute URLs", () => {
  assert.equal(safeNextPath("https://evil.com"), "/painel");
});

test("safeNextPath rejects protocol-relative paths", () => {
  assert.equal(safeNextPath("//evil.com"), "/painel");
  assert.equal(safeNextPath("/\\evil.com"), "/painel");
});

test("safeNextPath falls back to the panel when the value is missing", () => {
  assert.equal(safeNextPath(null), "/painel");
  assert.equal(safeNextPath(undefined), "/painel");
  assert.equal(safeNextPath(""), "/painel");
});
