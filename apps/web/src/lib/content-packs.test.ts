import assert from "node:assert/strict";
import { LIBRARY_CATEGORIES, LIBRARY_COPIES } from "./library-copies";
import { MERCADO_COPIES, NEUTRAL_COPIES, libraryCopiesForSegment } from "./content-packs";
import { SEGMENTS } from "./segments";

const catIds = new Set(LIBRARY_CATEGORIES.map((c) => c.id));

// Todo pack é navegável inteiro: ids únicos, categorias válidas e nenhuma aba vazia.
for (const [nome, pack] of [
  ["neutro", NEUTRAL_COPIES],
  ["mercado", MERCADO_COPIES],
] as const) {
  const ids = pack.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `${nome}: ids duplicados`);
  for (const c of pack) {
    assert.ok(catIds.has(c.category), `${nome}/${c.id}: categoria inválida (${c.category})`);
    assert.ok(c.title.trim().length > 0, `${nome}/${c.id}: título vazio`);
    assert.ok(c.body.trim().length > 0, `${nome}/${c.id}: corpo vazio`);
  }
  for (const cat of LIBRARY_CATEGORIES) {
    assert.ok(
      pack.some((c) => c.category === cat.id),
      `${nome}: categoria ${cat.id} sem copy (a aba abriria vazia)`,
    );
  }
}

// A razão de existir dos packs: neutro e mercado não vazam o jargão de moda.
const jargaoDeModa = /atacado|pe[cç]a|grade|revenda|cole[cç]/i;
for (const c of [...NEUTRAL_COPIES, ...MERCADO_COPIES]) {
  assert.ok(!jargaoDeModa.test(`${c.title} ${c.body}`), `${c.id}: vazou jargão de moda`);
}

// Moda recebe as copies ORIGINAIS aprovadas — a mesma referência, não uma cópia editada.
assert.equal(libraryCopiesForSegment("moda_atacado"), LIBRARY_COPIES);
assert.equal(libraryCopiesForSegment("mercado"), MERCADO_COPIES);

// Conta nova (null), segmento sem pack próprio e valor desconhecido caem no neutro.
assert.equal(libraryCopiesForSegment(null), NEUTRAL_COPIES);
assert.equal(libraryCopiesForSegment(undefined), NEUTRAL_COPIES);
assert.equal(libraryCopiesForSegment("outro"), NEUTRAL_COPIES);
assert.equal(libraryCopiesForSegment("calcados"), NEUTRAL_COPIES);
assert.equal(libraryCopiesForSegment("nao-existe"), NEUTRAL_COPIES);

// Todo segmento do catálogo resolve pra ALGUM pack (nunca undefined/vazio).
for (const s of SEGMENTS) {
  const pack = libraryCopiesForSegment(s.id);
  assert.ok(Array.isArray(pack) && pack.length > 0, `${s.id}: sem pack`);
}

console.log("content-packs tests passed");
