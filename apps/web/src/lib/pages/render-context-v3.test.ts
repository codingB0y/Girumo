import assert from "node:assert/strict";
import { test } from "node:test";
import { signRenderContext, verifyRenderContext } from "./render-context-core";

const SECRET = "s3cret";
const base = {
  slug: "loja-promo",
  publishedVersion: 3,
  noticeVersion: "v1",
  noticeText: "Ao continuar, voce solicita acesso ao grupo.",
  modelVersion: 1,
};

test("v3 dimensions (template key + impacto) sign and verify", () => {
  const token = signRenderContext(
    { ...base, structure: "evento-ao-vivo", visualDirection: "impacto" },
    SECRET,
  );
  const result = verifyRenderContext(token, "loja-promo", SECRET);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.structure, "evento-ao-vivo");
    assert.equal(result.value.visualDirection, "impacto");
  }
});

test("unknown direction is still refused", () => {
  assert.throws(() =>
    signRenderContext(
      { ...base, structure: "evento-ao-vivo", visualDirection: "neon" as never },
      SECRET,
    ),
  );
});
