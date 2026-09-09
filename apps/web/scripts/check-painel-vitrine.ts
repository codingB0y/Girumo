import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { PAINEL_ROOTS, lintPainelSource, onlyPnBlocks } from "../src/lib/painel/vitrine-lint";

const EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
// Casca antiga vive em globals.css junto da landing; só os blocos .pn-* entram.
const SHARED_CSS = "src/app/globals.css";

function sources(root: string): string[] {
  const absolute = path.resolve(root);
  const stat = statSync(absolute, { throwIfNoEntry: false });
  if (!stat) throw new Error(`painel:check: caminho de PAINEL_ROOTS não existe: ${root}`);
  if (stat.isFile()) return [absolute];
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !/\.test\.tsx?$/.test(file));
}

const findings = [...PAINEL_ROOTS, SHARED_CSS].flatMap(sources).flatMap((file) => {
  const relative = path.relative(process.cwd(), file).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");
  return lintPainelSource(relative, relative === SHARED_CSS ? onlyPnBlocks(source) : source);
});

for (const finding of findings) console.log(`FORBIDDEN ${finding}`);
console.log(findings.length === 0 ? "painel:check OK" : `painel:check: ${findings.length} achado(s)`);
process.exitCode = findings.length === 0 ? 0 : 1;
