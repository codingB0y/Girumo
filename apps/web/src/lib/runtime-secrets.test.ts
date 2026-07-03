import assert from "node:assert/strict";
import test from "node:test";
import { resolveSecret } from "./runtime-secrets";

test("produção rejeita secret ausente", () => {
  assert.throws(() => resolveSecret("AUTH_SECRET", undefined, "production", "dev-secret"));
});

test("development aceita default local", () => {
  assert.equal(resolveSecret("AUTH_SECRET", undefined, "development", "dev-secret"), "dev-secret");
});

test("secret configurado é normalizado", () => {
  assert.equal(resolveSecret("AUTH_SECRET", "  configured  ", "production", "dev"), "configured");
});
