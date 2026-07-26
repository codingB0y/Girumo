import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

const sourceRoot = path.resolve(import.meta.dirname, "..", "..");
const page = readFileSync(path.join(sourceRoot, "app/demo/page.tsx"), "utf8");
const middleware = readFileSync(path.join(sourceRoot, "middleware.ts"), "utf8");

test("a rota demo é pública e usa a experiência isolada", () => {
  assert.match(page, /DemoExperience/);
  assert.match(page, /Demonstração/);
  assert.match(middleware, /pathname === "\/demo"/);
});
