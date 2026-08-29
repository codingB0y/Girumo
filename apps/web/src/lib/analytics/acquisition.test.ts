import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractAcquisitionAttribution,
  isOutboundEvent,
  normalizeSourcePath,
  parseOutboundBeacon,
} from "./acquisition";

test("aceita o evento da allowlist e recusa qualquer outro nome", () => {
  assert.equal(isOutboundEvent("whatsapp_click"), true);
  assert.equal(isOutboundEvent("signup"), false);
  assert.equal(isOutboundEvent(""), false);
  assert.equal(isOutboundEvent(null), false);
});

test("normaliza caminho interno e recusa destino externo disfarçado de caminho", () => {
  assert.equal(normalizeSourcePath("/"), "/");
  assert.equal(normalizeSourcePath("/precos"), "/precos");
  assert.equal(normalizeSourcePath("  /precos  "), "/precos");

  // `//evil.com` é lido pelo browser como host externo, não como caminho.
  assert.equal(normalizeSourcePath("//evil.com"), null);
  assert.equal(normalizeSourcePath("https://evil.com"), null);
  assert.equal(normalizeSourcePath("precos"), null);
  assert.equal(normalizeSourcePath(""), null);
  assert.equal(normalizeSourcePath(42), null);
});

test("trunca caminho absurdamente longo em vez de gravar cardinalidade infinita", () => {
  const longo = `/${"a".repeat(500)}`;
  assert.equal(normalizeSourcePath(longo), null);
});

test("extrai atribuição presente e devolve null para campo ausente ou vazio", () => {
  const attribution = extractAcquisitionAttribution({
    utm_source: "google",
    utm_medium: "  organic  ",
    utm_campaign: "",
    referrer: "https://www.google.com/",
    lixo: "ignorado",
  });

  assert.equal(attribution.utm_source, "google");
  assert.equal(attribution.utm_medium, "organic");
  assert.equal(attribution.utm_campaign, null);
  assert.equal(attribution.utm_term, null);
  assert.equal(attribution.referrer, "https://www.google.com/");
});

test("trunca campo de atribuição em 300 caracteres", () => {
  const attribution = extractAcquisitionAttribution({ referrer: "x".repeat(400) });
  assert.equal(attribution.referrer?.length, 300);
});

test("beacon válido devolve evento, caminho de origem e atribuição juntos", () => {
  const parsed = parseOutboundBeacon({
    event: "whatsapp_click",
    source_path: "/",
    utm_source: "google",
    referrer: "https://www.google.com/",
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.event, "whatsapp_click");
  assert.equal(parsed.value.sourcePath, "/");
  assert.equal(parsed.value.attribution.utm_source, "google");
});

test("distingue o motivo da recusa para o erro poder ser logado", () => {
  const semEvento = parseOutboundBeacon({ source_path: "/" });
  assert.equal(semEvento.ok, false);
  if (!semEvento.ok) assert.equal(semEvento.reason, "bad_event");

  const semCaminho = parseOutboundBeacon({ event: "whatsapp_click", source_path: "evil" });
  assert.equal(semCaminho.ok, false);
  if (!semCaminho.ok) assert.equal(semCaminho.reason, "bad_path");
});
