/**
 * Conteúdo da LP v2 (Girumo). Fonte da verdade do shape versionado (JSONB) que
 * o editor produz, a API valida e o render público consome. Estrutura única v1
 * ("conversion" / "premium"), extensível para 3 estruturas × 2 direções depois.
 */

import { parseHex } from "./palette";
import type { LpVideoProvider } from "./video";

export type LpStructure = "conversion";
export type LpVisualDirection = "premium";

/** Limites de caracteres por campo (contrato com o editor guiado). */
export const CONTENT_LIMITS = {
  store_name: 60,
  badge: 30,
  headline: 72,
  description: 180,
  cta: 32,
  benefit_title: 40,
  benefit_desc: 90,
  person: 60,
  quote: 180,
} as const;

export const GALLERY_MIN = 2;
export const GALLERY_MAX = 6;
export const BENEFITS_MAX = 3;

/**
 * Referência de imagem. `media_id` (mídia enviada via /api/media) é o caminho
 * preferido; `url` existe como fallback para migração/preview de URL externa.
 * Ao menos um dos dois é obrigatório, além do `alt` (acessibilidade).
 */
export type LpMediaRef = {
  media_id?: string;
  url?: string;
  alt: string;
  focal_x?: number;
  focal_y?: number;
};

export type LpVideoRef = { provider: LpVideoProvider; id: string; poster?: LpMediaRef };

export type LpBenefit = { title: string; description: string };

type LpProofBase = { name: string; store: string; city: string; quote: string };
export type LpProof =
  | ({ kind: "video"; video: LpVideoRef } & LpProofBase)
  | ({ kind: "photo"; photo: LpMediaRef } & LpProofBase)
  | null;

export type LpContentV2 = {
  schema_version: 2;
  store_name: string;
  logo?: LpMediaRef | null;
  brand_color: string; // hex; paleta acessível derivada em runtime
  badge?: string;
  headline: string;
  description: string;
  cta: string;
  hero: LpMediaRef;
  benefits: LpBenefit[]; // até 3
  gallery: LpMediaRef[]; // 2–6
  proof?: LpProof;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function checkText(
  errors: string[],
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): void {
  if (!isNonEmptyString(value)) {
    if (required) errors.push(`${field} é obrigatório.`);
    return;
  }
  if (value.trim().length > max) errors.push(`${field} excede ${max} caracteres.`);
}

function checkMediaRef(errors: string[], ref: unknown, label: string): void {
  if (typeof ref !== "object" || ref === null) {
    errors.push(`${label} inválido.`);
    return;
  }
  const m = ref as Record<string, unknown>;
  if (!isNonEmptyString(m.media_id) && !isNonEmptyString(m.url)) {
    errors.push(`${label} precisa de media_id ou url.`);
  }
  if (!isNonEmptyString(m.alt)) {
    errors.push(`${label} precisa de texto alternativo (alt).`);
  }
}

function checkProof(errors: string[], proof: unknown): void {
  if (typeof proof !== "object" || proof === null) {
    errors.push("proof inválido.");
    return;
  }
  const p = proof as Record<string, unknown>;
  checkText(errors, p.name, "proof.name", CONTENT_LIMITS.person, true);
  checkText(errors, p.store, "proof.store", CONTENT_LIMITS.person, true);
  checkText(errors, p.city, "proof.city", CONTENT_LIMITS.person, true);
  checkText(errors, p.quote, "proof.quote", CONTENT_LIMITS.quote, true);

  if (p.kind === "video") {
    const v = p.video as Record<string, unknown> | undefined;
    const provider = v?.provider;
    if (!v || (provider !== "youtube" && provider !== "vimeo") || !isNonEmptyString(v.id)) {
      errors.push("proof.video precisa de provider (youtube|vimeo) e id.");
    }
  } else if (p.kind === "photo") {
    checkMediaRef(errors, p.photo, "proof.photo");
  } else {
    errors.push("proof.kind precisa ser 'video' ou 'photo'.");
  }
}

/** Valida o content v2 vindo do editor. Retorna erros legíveis (vazio = ok). */
export function validateContentV2(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return ["content inválido."];
  const c = input as Record<string, unknown>;

  if (c.schema_version !== 2) errors.push("schema_version precisa ser 2.");

  checkText(errors, c.store_name, "store_name", CONTENT_LIMITS.store_name, true);
  checkText(errors, c.headline, "headline", CONTENT_LIMITS.headline, true);
  checkText(errors, c.description, "description", CONTENT_LIMITS.description, true);
  checkText(errors, c.cta, "cta", CONTENT_LIMITS.cta, true);
  if (c.badge !== undefined && c.badge !== null && c.badge !== "") {
    checkText(errors, c.badge, "badge", CONTENT_LIMITS.badge, false);
  }

  if (!isNonEmptyString(c.brand_color) || !parseHex(c.brand_color)) {
    errors.push("brand_color precisa ser um hex válido (#rrggbb).");
  }

  checkMediaRef(errors, c.hero, "hero");
  if (c.logo !== undefined && c.logo !== null) checkMediaRef(errors, c.logo, "logo");

  if (!Array.isArray(c.benefits)) {
    errors.push("benefits precisa ser uma lista.");
  } else {
    if (c.benefits.length > BENEFITS_MAX) {
      errors.push(`benefits aceita no máximo ${BENEFITS_MAX} itens.`);
    }
    c.benefits.forEach((b, i) => {
      const item = b as Record<string, unknown> | null;
      checkText(errors, item?.title, `benefits[${i}].title`, CONTENT_LIMITS.benefit_title, true);
      checkText(errors, item?.description, `benefits[${i}].description`, CONTENT_LIMITS.benefit_desc, true);
    });
  }

  if (!Array.isArray(c.gallery)) {
    errors.push("gallery precisa ser uma lista.");
  } else {
    if (c.gallery.length < GALLERY_MIN || c.gallery.length > GALLERY_MAX) {
      errors.push(`gallery precisa ter entre ${GALLERY_MIN} e ${GALLERY_MAX} imagens.`);
    }
    c.gallery.forEach((g, i) => checkMediaRef(errors, g, `gallery[${i}]`));
  }

  if (c.proof !== undefined && c.proof !== null) {
    checkProof(errors, c.proof);
  }

  return errors;
}

// ---- adaptador do shape legado (Flow Pages v1) → v2 ----

type LegacyLpContent = {
  store_name: string;
  photo_url: string;
  headline: string;
  description: string;
  group_topic: string;
  primary_color: "iris" | "emerald" | "amber";
};

const LEGACY_COLOR_HEX: Record<LegacyLpContent["primary_color"], string> = {
  iris: "#7c3aed",
  emerald: "#10b981",
  amber: "#f59e0b",
};

const DEFAULT_CTA = "Quero entrar no grupo";

/**
 * Converte o content legado (fixo, com photo_url cru) para v2, sem perda dos
 * campos de conteúdo. O `group_topic` legado não é conteúdo de página — ele
 * alimenta o aviso/consent na camada de captura (notice_text), tratado adiante.
 * benefits/gallery ficam vazios aqui e são enriquecidos na migração (Fase 5).
 */
export function adaptLegacyContent(legacy: LegacyLpContent): LpContentV2 {
  return {
    schema_version: 2,
    store_name: legacy.store_name,
    brand_color: LEGACY_COLOR_HEX[legacy.primary_color] ?? LEGACY_COLOR_HEX.iris,
    headline: legacy.headline,
    description: legacy.description,
    cta: DEFAULT_CTA,
    hero: { url: legacy.photo_url, alt: `Foto de ${legacy.store_name}` },
    benefits: [],
    gallery: [],
    proof: null,
  };
}
