import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { HeroSection } from "@/components/pages/templates/sections/hero";
import type { LpContentV2 } from "./content";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const content: LpContentV2 = {
  schema_version: 2,
  store_name: "Girumo",
  logo: { media_id: "logo-original-5mb", alt: "Logo Girumo" },
  brand_color: "#6e2233",
  badge: "Atacado",
  headline: "Entre no grupo",
  description: "Receba as ofertas.",
  cta: "Quero entrar",
  hero: { media_id: "hero-id", alt: "Vitrine" },
  benefits: [],
  gallery: [
    { media_id: "gallery-1", alt: "Produto 1" },
    { media_id: "gallery-2", alt: "Produto 2" },
  ],
  proof: null,
};

test("logo enviado usa o otimizador do Next como recurso prioritário dimensionado", () => {
  const markup = renderToStaticMarkup(
    createElement(HeroSection, {
      content,
      formSlot: createElement("div"),
    }),
  );
  const logoTag = markup.match(/<img(?=[^>]*alt="Logo Girumo")[^>]*>/)?.[0];

  assert.ok(logoTag, "o logo precisa ser renderizado com alt acessível");
  assert.match(
    logoTag,
    /src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Flogo-original-5mb&amp;w=\d+&amp;q=\d+"/,
  );
  assert.match(logoTag, /width="192"/);
  assert.match(logoTag, /height="48"/);
  assert.match(logoTag, /fetchPriority="high"/i);
  assert.doesNotMatch(logoTag, /src="\/api\/p\/media\/logo-original-5mb"/);
});
