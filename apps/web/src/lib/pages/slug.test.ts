import assert from "node:assert/strict";
import test from "node:test";

import { generateSlug } from "./slug";

for (const reservedBrand of ["hubflow", "girumo"] as const) {
  test(`keeps ${reservedBrand} behind the loja namespace`, () => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const slug = generateSlug(reservedBrand);

      assert.match(slug, new RegExp(`^loja-${reservedBrand}-[a-z2-9]{4}$`));
      assert.doesNotMatch(slug, new RegExp(`^${reservedBrand}-`));
    }
  });
}
