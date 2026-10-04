import test from "node:test";
import assert from "node:assert/strict";
import { utf8Bytes } from "./bytes";

test("conta bytes UTF-8, não caracteres: ç custa 2 e emoji custa 4", () => {
  assert.equal(utf8Bytes("abc"), 3);
  assert.equal(utf8Bytes("ç"), 2);
  assert.equal(utf8Bytes("😀"), 4);
  assert.equal(utf8Bytes(""), 0);
});
