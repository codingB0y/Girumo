import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const templatesRoot = path.join(
  process.cwd(),
  "src",
  "components",
  "pages",
  "templates",
);

function templateSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return templateSources(absolute);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolute] : [];
  });
}

test("templates públicos não expõem a marca legada HubFlow", () => {
  const offenders = templateSources(templatesRoot).flatMap((absolute) => {
    const relative = path.relative(process.cwd(), absolute);
    return readFileSync(absolute, "utf8")
      .split(/\r?\n/)
      .flatMap((line, index) =>
        /\bHubFlow\b/i.test(line) ? [`${relative}:${index + 1}`] : [],
      );
  });

  assert.deepEqual(offenders, []);
});
