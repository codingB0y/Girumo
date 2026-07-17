import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const navSource = readFileSync(
  path.join(process.cwd(), "src", "components", "landing", "v2", "nav.tsx"),
  "utf8",
);
const landingSource = readFileSync(path.join(process.cwd(), "src", "app", "page.tsx"), "utf8");

test("keeps the mobile dialog boundary aligned with its focus trap", () => {
  assert.match(navSource, /<header[\s\S]*?role=\{open \? "dialog" : undefined\}/);
  assert.match(navSource, /headerRef\.current\?\.querySelectorAll<HTMLElement>/);
  assert.doesNotMatch(navSource, /menuRef\.current\?\.querySelectorAll<HTMLElement>/);
  assert.match(navSource, /href="\/login" className="[^"]*\bmd:inline\b[^"]*"/);
  assert.match(navSource, /node\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(navSource, /previousAriaHidden/);
});

test("keeps the canonical resource strip static", () => {
  assert.doesNotMatch(landingSource, /\blp-ticker\b/);
  assert.doesNotMatch(landingSource, /Array\.from\(\{ length: 2 \}\)/);
});
