import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CopyLinkButton } from "./copy-link-button";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "copy-link-button.tsx"), "utf8");

assert.equal(typeof CopyLinkButton, "function");
assert.match(source, /"use client"/);
assert.match(source, /navigator\.clipboard\.writeText/);
assert.match(source, /document\.createElement\("textarea"\)/);
assert.match(source, /document\.execCommand\("copy"\)/);
assert.match(source, /setTimeout\([\s\S]*,\s*1500\)/);
assert.match(source, /Link copiado/);
assert.match(source, /Nao foi possivel copiar o link/);
assert.match(source, /aria-label/);
assert.match(source, /type="button"/);
