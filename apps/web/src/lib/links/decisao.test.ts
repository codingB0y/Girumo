import test from "node:test";
import assert from "node:assert/strict";
import { INTEGRACOES_DEFAULTS, type Integracoes } from "@/lib/campaigns/settings";
import { capiEnvio, pixelDaTela } from "./decisao";

const semNada = INTEGRACOES_DEFAULTS;
const comPixel: Integracoes = {
  ...INTEGRACOES_DEFAULTS,
  meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "", test_code: "" },
};
const comToken: Integracoes = { ...comPixel, meta: { ...comPixel.meta, capi_token: "EAAsegredo" } };

test("pixel da CAMPANHA ganha do pixel do link", () => {
  assert.equal(pixelDaTela(comPixel, "999999"), "1234567890");
  assert.equal(pixelDaTela(semNada, "999999"), "999999");
  assert.equal(pixelDaTela(semNada, undefined), undefined);
});

test("CAPI só com pixel E token E gente de verdade", () => {
  assert.equal(capiEnvio(comToken, true), true);
  assert.equal(capiEnvio(comToken, false), false, "bot não gera CAPI");
  assert.equal(capiEnvio(comPixel, true), false, "sem token não há CAPI");
  assert.equal(capiEnvio(semNada, true), false);
});
