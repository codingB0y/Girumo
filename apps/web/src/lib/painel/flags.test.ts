import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { isPainelVitrineEnabled } from "./flags";

const original = process.env.NEXT_PUBLIC_PAINEL_VITRINE;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_PAINEL_VITRINE;
  else process.env.NEXT_PUBLIC_PAINEL_VITRINE = original;
});

test("nasce desligada: sem a env a casca antiga continua", () => {
  delete process.env.NEXT_PUBLIC_PAINEL_VITRINE;
  assert.equal(isPainelVitrineEnabled(), false);
});

test("só a string on liga, em qualquer caixa e com espaços", () => {
  for (const value of ["on", "ON", " on "]) {
    process.env.NEXT_PUBLIC_PAINEL_VITRINE = value;
    assert.equal(isPainelVitrineEnabled(), true, `valor ${JSON.stringify(value)}`);
  }
});

test("true, 1 e false não ligam", () => {
  for (const value of ["true", "1", "false", "off", ""]) {
    process.env.NEXT_PUBLIC_PAINEL_VITRINE = value;
    assert.equal(isPainelVitrineEnabled(), false, `valor ${JSON.stringify(value)}`);
  }
});
