/**
 * Adaptador editorial v2 → seções v3 (Fase 2). Função pura: recebe um
 * `LpContentV2` válido e devolve um `LpContentV3` do template `acesso-vip`,
 * na direção `editorial`, com a MESMA ordem da estrutura v2 (abertura →
 * depoimento → o que recebe → galeria). Nada é inventado: seção sem conteúdo
 * na v2 nasce desligada, e o único texto novo são os títulos de seção (a v2
 * não tinha), todos editáveis depois.
 *
 * Invariante (testada): `validateContentV3(fromContentV2(x))` é `[]` para
 * toda v2 válida — os limites v2 cabem nos v3 (72≤90, 180≤200, 40≤60, 90≤120,
 * 180=180). A rota de migração confia nisso e falha alto se não valer.
 */

import type { LpContentV2 } from "./content";
import { GALLERY_MIN } from "./content";
import type { LpContentV3 } from "./content-v3";
import type { LpSection, ProofVideo } from "./sections";

export const V2_MIGRATION_TEMPLATE = "acesso-vip" as const;

/** Títulos padrão das seções que a v2 não nomeava. */
export const V2_MIGRATION_TITLES = {
  proof: "Quem compra, recomenda",
  deliverables: "O que você encontra no grupo",
  gallery: "Um pouco do que tem lá dentro",
  cta_band: "Entre no grupo e receba o link",
  faq: "Perguntas frequentes",
} as const;

function proofSection(v2: LpContentV2): LpSection {
  const p = v2.proof;
  const title = V2_MIGRATION_TITLES.proof;
  const detail = p ? [p.store, p.city].filter(Boolean).join(" · ") : "";
  if (p?.kind === "video") {
    const video: ProofVideo = {
      provider: p.video.provider,
      id: p.video.id,
      ...(p.video.poster ? { poster: p.video.poster } : {}),
      name: p.name,
      ...(detail ? { detail } : {}),
      quote: p.quote,
    };
    return { type: "proof", variant: "video", enabled: true, data: { title, prints: [], cards: [], video } };
  }
  if (p?.kind === "photo") {
    return {
      type: "proof",
      variant: "cards",
      enabled: true,
      data: { title, prints: [], cards: [{ name: p.name, ...(detail ? { detail } : {}), quote: p.quote }] },
    };
  }
  return { type: "proof", variant: "video", enabled: false, data: { title, prints: [], cards: [] } };
}

export function fromContentV2(v2: LpContentV2): LpContentV3 {
  const sections: LpSection[] = [
    {
      type: "hero",
      variant: "form",
      enabled: true,
      data: {
        ...(v2.badge ? { badge: v2.badge } : {}),
        headline: v2.headline,
        description: v2.description,
        media: v2.hero,
      },
    },
    proofSection(v2),
    {
      type: "deliverables",
      variant: "checklist",
      enabled: v2.benefits.length > 0,
      data: {
        title: V2_MIGRATION_TITLES.deliverables,
        items: v2.benefits.map((b) => ({ title: b.title, description: b.description })),
      },
    },
    {
      type: "gallery",
      variant: "grid",
      enabled: v2.gallery.length >= GALLERY_MIN,
      data: { title: V2_MIGRATION_TITLES.gallery, items: v2.gallery },
    },
    {
      type: "cta_band",
      variant: "band",
      enabled: true,
      data: { title: V2_MIGRATION_TITLES.cta_band, note: "O convite chega logo depois do cadastro." },
    },
    {
      type: "faq",
      variant: "accordion",
      enabled: false,
      data: {
        title: V2_MIGRATION_TITLES.faq,
        items: [{ q: "Precisa de CNPJ?", a: "Não. Pessoa física compra no atacado com o pedido mínimo." }],
      },
    },
  ];

  return {
    schema_version: 3,
    template: V2_MIGRATION_TEMPLATE,
    direction: "editorial",
    store_name: v2.store_name,
    logo: v2.logo ?? null,
    brand_color: v2.brand_color,
    cta: v2.cta,
    sections,
  };
}
