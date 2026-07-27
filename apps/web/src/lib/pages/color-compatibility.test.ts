import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as pageSchema from "./schema";

test("renders persisted unknown landing colors with the Cobalt fallback", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "components", "pages", "templates", "basic.tsx"),
    "utf8",
  );

  assert.match(
    template,
    /COLOR_STYLES\[content\.primary_color\]\s*\?\?\s*COLOR_STYLES\.cobalt/,
  );
});

test("normalizes persisted unknown landing colors before editor reads", () => {
  const normalizeColor = (pageSchema as unknown as Record<string, unknown>).normalizeLpColor;
  const normalizePage = (pageSchema as unknown as Record<string, unknown>).normalizeLandingPage;

  assert.equal(typeof normalizeColor, "function");
  assert.equal(typeof normalizePage, "function");
  assert.equal((normalizeColor as (value: unknown) => string)("retired-value"), "cobalt");
  assert.equal((normalizeColor as (value: unknown) => string)("emerald"), "emerald");

  const store = readFileSync(path.join(process.cwd(), "src", "lib", "pages", "store.ts"), "utf8");
  assert.match(store, /normalizeLandingPage/);
});
