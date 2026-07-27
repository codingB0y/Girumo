import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scanner = path.join(process.cwd(), "scripts", "check-girumo-brand.mjs");

test("reports a forbidden public brand reference with path, line, and match", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-"));

  try {
    const appDir = path.join(fixture, "src", "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "page.tsx"), "export default 'Girumo';\nconst stale = 'HubFlow';\n", "utf8");

    const result = spawnSync(process.execPath, [scanner], {
      cwd: fixture,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /src[\\/]app[\\/]page\.tsx:2:HubFlow/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("reports every forbidden legacy name, message, color, and asset family", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-"));

  try {
    const appDir = path.join(fixture, "src", "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      path.join(appDir, "legacy.css"),
      [
        "/* WhatsApp Growth OS */",
        "/* O fluxo que vende */",
        ".hex { color: #7C5CFF; }",
        ".rgb { color: rgba(106, 75, 240, 0.5); }",
        ".asset { background: url('/brand/symbol-iris-gradient.svg'); }",
        ".lockup { background: url('/brand/lockup-horizontal-dark.png'); }",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(process.execPath, [scanner], {
      cwd: fixture,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    for (const expected of [
      "WhatsApp Growth OS",
      "O fluxo que vende",
      "#7C5CFF",
      "rgba(106, 75, 240, 0.5)",
      "symbol-iris-gradient",
      "lockup-horizontal-dark",
    ]) {
      assert.match(result.stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("redacts only documented compatibility values and still reports nearby public copy", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-"));

  try {
    const appDir = path.join(fixture, "src", "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      path.join(appDir, "compatibility.ts"),
      [
        "const site = 'https://hubflow.com.br';",
        "const app = 'https://app.hubflow.com.br';",
        "const sender = 'noreply@hubflow.com.br';",
        "const admin = 'igor@hubflow.com.br';",
        "const service = 'hubflow-web';",
        "const engine = 'hubflow-engine';",
        "const secret = process.env.HUBFLOW_ENGINE_TOKEN;",
        "const stalePublicCopy = 'HubFlow para vender mais';",
      ].join("\n"),
      "utf8",
    );

    const securityDir = path.join(appDir, "api", "admin", "dev-tools", "security-check");
    mkdirSync(securityDir, { recursive: true });
    writeFileSync(
      path.join(securityDir, "route.ts"),
      'const blocked = !process.env.ENGINE_URL?.includes("hubflow.com");\n',
      "utf8",
    );

    const pagesDir = path.join(fixture, "src", "lib", "pages");
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(path.join(pagesDir, "slug.ts"), 'const RESERVED = new Set(["hubflow", "girumo"]);\n', "utf8");

    const result = spawnSync(process.execPath, [scanner], {
      cwd: fixture,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    const allowed = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("ALLOWED "));
    const blocked = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("FORBIDDEN "));
    assert.equal(allowed.length, 10);
    assert.deepEqual(blocked, [`FORBIDDEN ${path.join("src", "app", "compatibility.ts")}:8:HubFlow`]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("skips tests, generated folders, unsupported extensions, and binary sources", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-"));

  try {
    const appDir = path.join(fixture, "src", "app");
    mkdirSync(path.join(appDir, "generated"), { recursive: true });
    mkdirSync(path.join(appDir, ".next"), { recursive: true });
    writeFileSync(path.join(appDir, "page.test.ts"), "const legacy = 'HubFlow';\n", "utf8");
    writeFileSync(path.join(appDir, "page.test.tsx"), "export const Legacy = () => <p>HubFlow</p>;\n", "utf8");
    writeFileSync(path.join(appDir, "notes.md"), "HubFlow\n", "utf8");
    writeFileSync(path.join(appDir, "generated", "legacy.ts"), "const legacy = 'HubFlow';\n", "utf8");
    writeFileSync(path.join(appDir, ".next", "legacy.ts"), "const legacy = 'HubFlow';\n", "utf8");
    writeFileSync(path.join(appDir, "binary.svg"), Buffer.from([0, ...Buffer.from("HubFlow")]));

    const result = spawnSync(process.execPath, [scanner], {
      cwd: fixture,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("verifies the Girumo landing while preserving the technical health service", () => {
  const verification = readFileSync(
    path.join(process.cwd(), "..", "..", "infra", "scripts", "verify-online.ps1"),
    "utf8",
  );

  assert.match(verification, /\$landing\.Content -notmatch "GIRUMO"/);
  assert.match(verification, /Landing nao contem a marca GIRUMO\./);
  assert.doesNotMatch(verification, /Landing nao contem a marca HUBFLOW\./);
  assert.match(verification, /\$appHealth\.service -ne "hubflow-web"/);
});

test("exposes the brand audit as the web workspace brand:check command", () => {
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(packageJson.scripts["brand:check"], "node scripts/check-girumo-brand.mjs");
});

test("does not allow compatibility substrings or extra path-specific literals", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-"));

  try {
    const appDir = path.join(fixture, "src", "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      path.join(appDir, "adversarial.ts"),
      [
        "const hostileHost = 'https://hubflow.com.br.evil';",
        "const hostileService = 'hubflow-webinar';",
        "const hostileSender = 'xnoreply@hubflow.com.br';",
      ].join("\n"),
      "utf8",
    );

    const securityDir = path.join(appDir, "api", "admin", "dev-tools", "security-check");
    mkdirSync(securityDir, { recursive: true });
    writeFileSync(
      path.join(securityDir, "route.ts"),
      [
        'const isolated = !process.env.ENGINE_URL?.includes("hubflow.com");',
        'const rogue = "hubflow.com";',
      ].join("\n"),
      "utf8",
    );

    const pagesDir = path.join(fixture, "src", "lib", "pages");
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(
      path.join(pagesDir, "slug.ts"),
      ['const RESERVED = new Set(["hubflow", "girumo"]);', 'const publicCopy = "hubflow";'].join("\n"),
      "utf8",
    );

    const result = spawnSync(process.execPath, [scanner], { cwd: fixture, encoding: "utf8" });
    const allowed = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("ALLOWED "));
    const blocked = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("FORBIDDEN "));

    assert.equal(result.status, 1);
    assert.equal(allowed.length, 3, result.stdout);
    assert.equal(blocked.length, 5, result.stdout);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("skips invalid UTF-8 binaries and symbolic links outside scanner roots", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-"));
  const external = mkdtempSync(path.join(tmpdir(), "girumo-brand-audit-external-"));

  try {
    const appDir = path.join(fixture, "src", "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "invalid.svg"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("HubFlow")]));
    writeFileSync(path.join(external, "outside.ts"), "const legacy = 'HubFlow';\n", "utf8");
    symlinkSync(external, path.join(appDir, "linked"), "junction");

    const result = spawnSync(process.execPath, [scanner], { cwd: fixture, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});
