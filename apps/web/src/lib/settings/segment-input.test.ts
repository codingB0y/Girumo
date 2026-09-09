import assert from "node:assert/strict";
import { INVALID_SEGMENT, parseSegmentInput } from "./segment-input";
import { SEGMENTS } from "@/lib/segments";

// Todo id do catálogo passa — a lista é a fonte única.
for (const s of SEGMENTS) {
  assert.equal(parseSegmentInput(s.id), s.id, `${s.id} deveria ser aceito`);
}

// Espaço em volta não invalida um id certo (o <select> não gera, mas API é API).
assert.equal(parseSegmentInput("  mercado  "), "mercado");

// Apagar a escolha é legítimo: null e string vazia limpam, não erram.
assert.equal(parseSegmentInput(null), null);
assert.equal(parseSegmentInput(""), null);
assert.equal(parseSegmentInput("   "), null);

// Lixo é recusado na fronteira, não gravado.
assert.equal(parseSegmentInput("atacado"), INVALID_SEGMENT, "id fora do catálogo");
assert.equal(parseSegmentInput("MODA_ATACADO"), INVALID_SEGMENT, "id é case-sensitive");
assert.equal(parseSegmentInput(3), INVALID_SEGMENT);
assert.equal(parseSegmentInput(undefined), INVALID_SEGMENT);
assert.equal(parseSegmentInput({ id: "mercado" }), INVALID_SEGMENT);

console.log("segment-input tests passed");
