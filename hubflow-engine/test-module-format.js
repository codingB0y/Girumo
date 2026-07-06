const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const read = (file) => readFileSync(join(__dirname, file), "utf8");
const internalModules = [
  "anti-ban-queue.js",
  "queued-text-sender.js",
  "warmup.js",
  "group-guard.js",
  "delivery-tracker.js",
];

test("módulos internos usam CommonJS explícito", () => {
  for (const file of internalModules) {
    const source = read(file);
    assert.doesNotMatch(source, /^\s*(?:import\s.+\sfrom\s|export\s)/m, file);
    assert.match(source, /module\.exports\s*=/, file);
  }
});

test("entrypoint carrega Baileys com importação dinâmica", () => {
  const source = read("index.js");
  assert.doesNotMatch(source, /require\(["']@whiskeysockets\/baileys["']\)/);
  assert.match(source, /import\(["']@whiskeysockets\/baileys["']\)/);
});

test("estágios Docker usam a mesma versão completa de Node e Alpine", () => {
  const images = [...read("Dockerfile").matchAll(/^FROM\s+(\S+)/gm)].map((match) => match[1]);
  assert.equal(images.length, 2);
  assert.equal(images[0], images[1]);
  assert.match(images[0], /^node:\d+\.\d+\.\d+-alpine\d+\.\d+$/);
});
