import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLpTrackingIds } from "./tracking-input";

test("campo ausente fica fora do patch; vazio e null apagam", () => {
  assert.deepEqual(parseLpTrackingIds({}), { ok: true, patch: {} });
  assert.deepEqual(parseLpTrackingIds({ meta_pixel_id: "  ", ga4_id: null }), {
    ok: true,
    patch: { meta_pixel_id: null, ga4_id: null },
  });
});

test("id válido sai normalizado: trim, e GA4 em maiúsculas", () => {
  assert.deepEqual(parseLpTrackingIds({ meta_pixel_id: " 1234567890 ", ga4_id: " g-ab12cd34ef " }), {
    ok: true,
    patch: { meta_pixel_id: "1234567890", ga4_id: "G-AB12CD34EF" },
  });
});

test("GTM no lugar do GA4 é recusado — gtag/js?id=GTM-… serviria um contêiner inteiro", () => {
  const r = parseLpTrackingIds({ ga4_id: "GTM-WJTQSV4" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.details.length, 1);
  // O editor põe a mensagem no campo pela primeira palavra do detalhe.
  assert.match(r.details[0], /^ga4_id /);
  assert.match(r.details[0], /G-/);
});

test("cada campo errado vira um detalhe próprio, nomeando o campo", () => {
  for (const ruim of ["abc", "1234", "1".repeat(21), 123456, true]) {
    const r = parseLpTrackingIds({ meta_pixel_id: ruim, ga4_id: "AW-123456" });
    assert.equal(r.ok, false, String(ruim));
    if (r.ok) continue;
    assert.deepEqual(r.details.map((d) => d.split(" ")[0]), ["meta_pixel_id", "ga4_id"]);
  }
});
