import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { PAINEL_ROOTS, lintPainelSource } from "../src/lib/painel/vitrine-lint";

const EXTENSIONS = new Set([".ts", ".tsx", ".css"]);

function sources(root: string): string[] {
  const absolute = path.resolve(root);
  if (!statSync(absolute, { throwIfNoEntry: false })) return [];
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !/\.test\.tsx?$/.test(file));
}

const findings = PAINEL_ROOTS.flatMap(sources).flatMap((file) => {
  const relative = path.relative(process.cwd(), file).replaceAll("\\", "/");
  return lintPainelSource(relative, readFileSync(file, "utf8"));
});

for (const finding of findings) console.log(`FORBIDDEN ${finding}`);
console.log(findings.length === 0 ? "painel:check OK" : `painel:check: ${findings.length} achado(s)`);
process.exitCode = findings.length === 0 ? 0 : 1;
