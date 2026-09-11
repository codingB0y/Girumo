import assert from "node:assert/strict";
import { buildSeedRows } from "./template-folders";

for (const segment of ["moda_atacado", "mercado", null, "outro"]) {
  const { folders, templatesByFolder } = buildSeedRows(segment);

  assert.equal(folders.length, 5, `${segment}: seed deve ter as 5 pastas padrão`);

  const folderNames = new Set(folders.map((f) => f.name));
  assert.equal(folderNames.size, folders.length, `${segment}: nomes de pasta duplicados`);

  // Toda pasta nasce navegável (senão a aba abriria vazia); o total por pack
  // varia (moda_atacado tem 2 por categoria, os demais 1) — checado à parte.
  for (const folder of folders) {
    const copies = templatesByFolder[folder.name] ?? [];
    assert.ok(copies.length > 0, `${segment}: pasta "${folder.name}" sem copy no seed`);
    for (const copy of copies) {
      assert.ok(copy.name.trim().length > 0, `${segment}: copy sem título na pasta "${folder.name}"`);
      assert.ok(copy.body.trim().length > 0, `${segment}: copy "${copy.name}" com corpo vazio`);
    }
  }
}

// moda_atacado é o pack original (P1.14): 10 copies, 2 por categoria.
const moda = buildSeedRows("moda_atacado").templatesByFolder;
const modaTotal = Object.values(moda).reduce((n, copies) => n + copies.length, 0);
assert.equal(modaTotal, 10, "moda_atacado: total de copies do seed mudou de 10");

console.log("template-folders seed tests passed");
