import assert from "node:assert/strict";
import { LIBRARY_COPIES, LIBRARY_CATEGORIES, libraryCopiesByCategory } from "./library-copies";

assert.equal(LIBRARY_CATEGORIES.length, 5);
assert.ok(LIBRARY_COPIES.length >= 5, "pelo menos 5 copies (aceite do P1.14)");

const ids = LIBRARY_COPIES.map((c) => c.id);
assert.equal(new Set(ids).size, ids.length, "ids duplicados");

const catIds = new Set(LIBRARY_CATEGORIES.map((c) => c.id));
for (const c of LIBRARY_COPIES) {
  assert.ok(catIds.has(c.category), `${c.id}: categoria inválida (${c.category})`);
  assert.ok(c.title.trim().length > 0, `${c.id}: título vazio`);
  assert.ok(c.body.trim().length > 0, `${c.id}: corpo vazio`);
}

// Toda categoria navegável tem ao menos uma copy (senão a aba abre vazia).
for (const cat of LIBRARY_CATEGORIES) {
  assert.ok(libraryCopiesByCategory(cat.id).length > 0, `categoria ${cat.id} sem copy`);
}

console.log("library-copies tests passed");
