import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

const sourceRoot = path.resolve(import.meta.dirname, "..", "..");
const source = readFileSync(path.join(sourceRoot, "components/demo/demo-experience.tsx"), "utf8");

test("a experiência demo não toca integrações reais", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\/api\/|ENGINE_URL|supabase|localStorage|sessionStorage|document\.cookie/i);
  assert.match(source, /Modo demonstração/);
  assert.match(source, /href="\/signup"/);
});
