import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const expected = {
  "Manrope-Variable.ttf": { weight: 200, axis: [200, 200, 800] },
  "Manrope-Medium.ttf": { weight: 500 },
  "Manrope-SemiBold.ttf": { weight: 600 },
  "Manrope-Bold.ttf": { weight: 700 },
  "IBMPlexSans-Regular.ttf": { weight: 400 },
  "IBMPlexSans-Medium.ttf": { weight: 500 },
  "IBMPlexSans-SemiBold.ttf": { weight: 600 },
  "IBMPlexSans-Bold.ttf": { weight: 700 },
  "IBMPlexMono-Regular.ttf": { weight: 400 },
  "IBMPlexMono-Medium.ttf": { weight: 500 },
};

function tableMap(buffer) {
  const signature = buffer.subarray(0, 4).toString("hex");
  assert.ok(signature === "00010000" || signature === "4f54544f", `assinatura sfnt inválida: ${signature}`);
  const count = buffer.readUInt16BE(4);
  const tables = new Map();
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    const tag = buffer.subarray(record, record + 4).toString("ascii");
    tables.set(tag, {
      offset: buffer.readUInt32BE(record + 8),
      length: buffer.readUInt32BE(record + 12),
    });
  }
  return tables;
}

function fixed(buffer, offset) {
  return buffer.readInt32BE(offset) / 65536;
}

function inspectTtf(buffer) {
  const tables = tableMap(buffer);
  const os2 = tables.get("OS/2");
  assert.ok(os2, "tabela OS/2 ausente");
  const weight = buffer.readUInt16BE(os2.offset + 4);
  const fsType = buffer.readUInt16BE(os2.offset + 8);
  const fvar = tables.get("fvar");
  let axis = null;
  if (fvar) {
    const axesOffset = buffer.readUInt16BE(fvar.offset + 4);
    const axisCount = buffer.readUInt16BE(fvar.offset + 8);
    const axisSize = buffer.readUInt16BE(fvar.offset + 10);
    for (let index = 0; index < axisCount; index += 1) {
      const offset = fvar.offset + axesOffset + index * axisSize;
      if (buffer.subarray(offset, offset + 4).toString("ascii") === "wght") {
        axis = [fixed(buffer, offset + 4), fixed(buffer, offset + 8), fixed(buffer, offset + 12)];
      }
    }
  }
  return { weight, fsType, axis };
}

const report = {};
for (const [filename, contract] of Object.entries(expected)) {
  const buffer = await readFile(path.join(here, "desktop", filename));
  const result = inspectTtf(buffer);
  assert.equal(result.weight, contract.weight, `${filename}: peso inesperado`);
  assert.equal(result.fsType, 0, `${filename}: incorporação restrita`);
  if (contract.axis) assert.deepEqual(result.axis, contract.axis, `${filename}: eixo wght inesperado`);
  else assert.equal(result.axis, null, `${filename}: a instância estática ainda contém fvar`);
  report[filename] = result;
}

const monoMediumWoff2 = await readFile(path.join(here, "ibm-plex-mono-medium.woff2"));
assert.equal(monoMediumWoff2.subarray(0, 4).toString("ascii"), "wOF2", "IBM Plex Mono Medium não é WOFF2");
const monoMediumSha256 = createHash("sha256").update(monoMediumWoff2).digest("hex");
assert.equal(
  monoMediumSha256,
  "33faf307fa6031fb4062276d7320a6d632de890cbb347576fd80cfa01077bc25",
  "IBM Plex Mono Medium WOFF2 divergiu do binário oficial",
);

console.log(JSON.stringify({ ok: true, desktop: report, monoMediumWoff2Sha256: monoMediumSha256 }, null, 2));
