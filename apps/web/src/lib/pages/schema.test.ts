import assert from "node:assert/strict";
import { noticeTextFor, parseContentInput } from "./schema";

const legacy = {
  store_name: "Mega Stock",
  photo_url: "https://cdn.example.com/loja.jpg",
  headline: "Atacado infantil com preço de fábrica",
  description: "Peças novas toda semana direto pro seu grupo VIP.",
  group_topic: "ofertas de atacado infantil",
  primary_color: "cobalt",
};

const v2 = {
  schema_version: 2,
  store_name: "Bazar da Vila",
  brand_color: "#7c3aed",
  headline: "Ofertas do grupo antes de todo mundo",
  description: "Entre no grupo e receba os drops com preço de atacado.",
  cta: "Entrar no grupo",
  hero: { media_id: "m_hero", alt: "Vitrine" },
  benefits: [{ title: "Preço de atacado", description: "Sem atravessador." }],
  gallery: [
    { media_id: "m1", alt: "Peça 1" },
    { media_id: "m2", alt: "Peça 2" },
  ],
};

// v2 válido → sanitizado, versão 2
const okV2 = parseContentInput({ ...v2, evil: "<script>" });
assert.equal(okV2.ok, true);
if (okV2.ok) {
  assert.equal(okV2.schema_version, 2);
  assert.equal("evil" in okV2.content, false); // passou pelo sanitizador
}

// legado válido (sem schema_version) → versão 1, editor antigo segue funcionando
const okLegacy = parseContentInput(legacy);
assert.equal(okLegacy.ok, true);
if (okLegacy.ok) {
  assert.equal(okLegacy.schema_version, 1);
  assert.equal((okLegacy.content as { store_name: string }).store_name, "Mega Stock");
}

// inválidos: erros da versão certa, sem cair no validador do outro shape
const badV2 = parseContentInput({ ...v2, brand_color: "roxo" });
assert.equal(badV2.ok, false);
if (!badV2.ok) assert.ok(badV2.errors.some((e) => e.includes("brand_color")));

const badLegacy = parseContentInput({ ...legacy, photo_url: "" });
assert.equal(badLegacy.ok, false);
if (!badLegacy.ok) assert.ok(badLegacy.errors.some((e) => e.includes("photo_url")));

// declarou v2 mas mandou o shape errado → erros de v2 (não do legado)
const claimsV2 = parseContentInput({ schema_version: 2, store_name: "X" });
assert.equal(claimsV2.ok, false);
if (!claimsV2.ok) {
  assert.ok(claimsV2.errors.some((e) => e.includes("hero")));
  assert.equal(
    claimsV2.errors.some((e) => e.includes("photo_url")),
    false,
  );
}

// lixo → erro, nunca exceção
assert.equal(parseContentInput(null).ok, false);
assert.equal(parseContentInput("texto").ok, false);

// ---- aviso apresentado = aviso snapshotado (prova) ----
// v2 não tem group_topic: o aviso cita a loja e a natureza do grupo.
const noticeV2 = noticeTextFor(v2 as never);
assert.ok(noticeV2.includes("Bazar da Vila"));
assert.ok(noticeV2.length > 0);

// legado mantém a fórmula com o tema do grupo (não regride)
const noticeLegacy = noticeTextFor(legacy as never);
assert.ok(noticeLegacy.includes("Mega Stock"));
assert.ok(noticeLegacy.includes("ofertas de atacado infantil"));

console.log("schema tests passed");
