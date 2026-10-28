import { test } from "node:test";
import assert from "node:assert/strict";
import { ga4TagId } from "./tracking-scripts";

test("ga4TagId só deixa passar id de GA4: gtag/js?id=GTM-… serviria um contêiner GTM com o nonce da LP", () => {
  assert.equal(ga4TagId("G-ABC123XYZ"), "G-ABC123XYZ");
  assert.equal(ga4TagId(" g-abc123xyz "), "G-ABC123XYZ");
  for (const ruim of ["GTM-WJTQSV4", "AW-123456", "231123", "G-", "G-AB", 'G-ABCD"></script>', "G-ABCD&l=x", "", null]) {
    assert.equal(ga4TagId(ruim), null, String(ruim));
  }
});
