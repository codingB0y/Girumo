import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const roots = [
  "src/app",
  "src/components",
  "src/lib/email",
  "src/lib/stores/automations.ts",
  "src/lib/pages/slug.ts",
];

const sourceExtensions = new Set([".ts", ".tsx", ".css", ".html", ".svg"]);
const generatedFolders = new Set([".next", "build", "coverage", "dist", "generated", "node_modules"]);
const forbidden = [
  /\bhubflow\b/gi,
  /WhatsApp Growth OS/gi,
  /O fluxo que vende/gi,
  /#(?:7C5CFF|6A4BF0|8A6CFF|3D1FB0|A78CFF|3D5AF1|9A82FF|B9ABFF|6A45F0|5836C9|46299E|F3F1FF|E9E5FF|D6CEFF)\b/gi,
  /rgba?\(\s*(?:106\s*,\s*75\s*,\s*240|124\s*,\s*92\s*,\s*255|61\s*,\s*31\s*,\s*176|88\s*,\s*54\s*,\s*201)\b[^)]*\)/gi,
  /symbol-iris-gradient|lockup-horizontal-(?:dark|light)/gi,
];

const globalCompatibility = [
  /(?<![A-Za-z0-9])https:\/\/app\.hubflow\.com\.br(?![A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-])/g,
  /(?<![A-Za-z0-9])https:\/\/hubflow\.com\.br(?![A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-])/g,
  /(?<![A-Za-z0-9._%+-])noreply@hubflow\.com\.br(?![A-Za-z0-9.-])/g,
  /(?<![A-Za-z0-9._%+-])igor@hubflow\.com\.br(?![A-Za-z0-9.-])/g,
  /(?<![A-Za-z0-9_-])hubflow-web(?![A-Za-z0-9_-])/g,
  /(?<![A-Za-z0-9_-])hubflow-engine(?![A-Za-z0-9_-])/g,
  /\bHUBFLOW_[A-Z0-9_]+\b/g,
];

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function redactCompatibility(relativeFile, source) {
  const ranges = [];

  for (const pattern of globalCompatibility) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      ranges.push({ index: match.index, match: match[0] });
    }
  }

  if (relativeFile === "src/app/api/admin/dev-tools/security-check/route.ts") {
    const context = 'process.env.ENGINE_URL?.includes("hubflow.com")';
    const contextIndex = source.indexOf(context);
    if (contextIndex >= 0) {
      const match = '"hubflow.com"';
      ranges.push({ index: contextIndex + context.indexOf(match), match });
    }
  }

  if (relativeFile === "src/lib/pages/slug.ts") {
    const reserved = /const\s+RESERVED\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/.exec(source);
    if (reserved) {
      const bodyStart = reserved.index + reserved[0].indexOf(reserved[1]);
      const bodyEnd = bodyStart + reserved[1].length;
      for (const match of ['"hubflow"', '"girumo"']) {
        const index = source.indexOf(match, bodyStart);
        if (index >= bodyStart && index + match.length <= bodyEnd) ranges.push({ index, match });
      }
    }
  }

  const uniqueRanges = [...new Map(ranges.map((range) => [`${range.index}:${range.match.length}`, range])).values()];
  let redacted = source;
  for (const range of [...uniqueRanges].sort((a, b) => b.index - a.index)) {
    redacted = `${redacted.slice(0, range.index)}${" ".repeat(range.match.length)}${redacted.slice(range.index + range.match.length)}`;
  }

  const allowed = uniqueRanges
    .sort((a, b) => a.index - b.index)
    .map((range) => ({ line: lineAt(source, range.index), match: range.match }));
  return { redacted, allowed };
}

function collectSources(target) {
  const absolute = path.resolve(target);
  let stats;

  try {
    stats = lstatSync(absolute);
  } catch {
    return [];
  }

  if (stats.isSymbolicLink()) return [];

  if (stats.isDirectory()) {
    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory() && generatedFolders.has(entry.name)) return [];
      return collectSources(path.join(absolute, entry.name));
    });
  }

  if (!stats.isFile() || !sourceExtensions.has(path.extname(absolute))) return [];
  if (/\.test\.tsx?$/i.test(absolute)) return [];
  return [absolute];
}

const allowedValues = [];
const findings = [];

for (const root of roots) {
  for (const file of collectSources(root)) {
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      continue;
    }
    const relativeFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const { redacted, allowed } = redactCompatibility(relativeFile, source);
    for (const value of allowed) {
      allowedValues.push(`ALLOWED ${path.relative(process.cwd(), file)}:${value.line}:${value.match}`);
    }
    for (const pattern of forbidden) {
      pattern.lastIndex = 0;
      for (const match of redacted.matchAll(pattern)) {
        const line = lineAt(redacted, match.index);
        findings.push(`FORBIDDEN ${path.relative(process.cwd(), file)}:${line}:${match[0]}`);
      }
    }
  }
}

for (const allowed of allowedValues) console.log(allowed);
for (const finding of findings) console.log(finding);
process.exitCode = findings.length === 0 ? 0 : 1;
