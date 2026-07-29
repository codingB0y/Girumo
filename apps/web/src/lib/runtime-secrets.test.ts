import assert from "node:assert/strict";
import test from "node:test";
import { resolveSecret } from "./runtime-secrets";

test("produção rejeita secret ausente", () => {
  assert.throws(() => resolveSecret("AUTH_SECRET", undefined, "production", "dev-secret"));
});

test("build de produção não quebra por secret ausente (NEXT_PHASE)", () => {
  const prev = process.env.NEXT_PHASE;
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    assert.equal(resolveSecret("AUTH_SECRET", undefined, "production", "dev-secret"), "dev-secret");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = prev;
  }
});

test("development aceita default local", () => {
  assert.equal(resolveSecret("AUTH_SECRET", undefined, "development", "dev-secret"), "dev-secret");
});

test("secret configurado é normalizado", () => {
  assert.equal(resolveSecret("AUTH_SECRET", "  configured  ", "production", "dev"), "configured");
});
