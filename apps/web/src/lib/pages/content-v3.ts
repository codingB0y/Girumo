/**
 * Conteúdo v3 (Páginas com seções). Fonte da verdade do shape gravado no JSONB
 * `content` quando `schema_version === 3`: identidade da loja + `cta` global +
 * lista de seções na ordem do template. Valida e sanitiza como o v2
 * (`validateContentV2`/`toContentV2`): quem grava passa pelos dois.
 *
 * Erros usam o caminho `<tipo>.<campo>` (ex.: `hero.headline`, `faq.items[1].a`)
 * — o tipo é único por página, então serve de chave estável pro editor pendurar
 * o erro no input certo (`errorField`).
 */

import type { LpMediaRef } from "./content";
import { toMediaRef } from "./content";
import type { LpVideoProvider } from "./video";
import { parseHex } from "./palette";
import { isLpContentV3 } from "./render";
import {
  LP_DIRECTIONS,
  SECTION_CATALOG,
  V3_GALLERY_MIN,
  V3_LIMITS,
  V3_MAX,
  emptySectionData,
  isSectionType,
  isVariantOf,
  type LpDirection,
  type LpSection,
  type LpSectionType,
  type ProofVideo,
  type SectionOf,
} from "./sections";
import { TEMPLATES_V3, isTemplateKey, type LpTemplateKey } from "./templates-v3";

export type LpContentV3 = {
  schema_version: 3;
  template: LpTemplateKey;
  direction: LpDirection;
  store_name: string;
  logo?: LpMediaRef | null;
  brand_color: string;
  /** Frase única do botão: abertura, faixa e CTA fixo repetem a MESMA. */
  cta: string;
  sections: LpSection[];
};

export { isLpContentV3 };

/* ----------------------------- validação ----------------------------- */

type Rec = Record<string, unknown>;

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function text(errors: string[], v: unknown, path: string, max: number, required: boolean): void {
  if (!str(v)) {
    if (required) errors.push(`${path} é obrigatório.`);
    return;
  }
  if (v.trim().length > max) errors.push(`${path} excede ${max} caracteres.`);
}

function media(errors: string[], ref: unknown, path: string): void {
  if (typeof ref !== "object" || ref === null) {
    errors.push(`${path} inválido.`);
    return;
  }
  const m = ref as Rec;
  if (!str(m.media_id) && !str(m.url)) errors.push(`${path} precisa de media_id ou url.`);
  if (typeof m.alt !== "string") errors.push(`${path} precisa de texto alternativo (alt).`);
}

function optionalMedia(errors: string[], ref: unknown, path: string): void {
  if (ref === undefined || ref === null) return;
  media(errors, ref, path);
}

function list(errors: string[], v: unknown, path: string, min: number, max: number): Rec[] | null {
  if (!Array.isArray(v)) {
    errors.push(`${path} precisa ser uma lista.`);
    return null;
  }
  if (v.length < min) errors.push(`${path} precisa de pelo menos ${min} ${min === 1 ? "item" : "itens"}.`);
  if (v.length > max) errors.push(`${path} aceita no máximo ${max} itens.`);
  return v.map((item) => (typeof item === "object" && item !== null ? (item as Rec) : {}));
}

const VIDEO_PROVIDERS: readonly string[] = ["youtube", "vimeo"];

function validIso(v: unknown): boolean {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

function validateSectionData(errors: string[], section: Rec): void {
  const type = section.type as LpSectionType;
  const variant = section.variant as string;
  const d = (typeof section.data === "object" && section.data !== null ? section.data : {}) as Rec;
  const L = V3_LIMITS;

  switch (type) {
    case "hero": {
      text(errors, d.badge, "hero.badge", L.badge, false);
      text(errors, d.headline, "hero.headline", L.headline, true);
      text(errors, d.description, "hero.description", L.description, true);
      text(errors, d.highlight, "hero.highlight", L.highlight, false);
      if (str(d.highlight) && str(d.headline) && !d.headline.includes(d.highlight.trim())) {
        errors.push("hero.highlight precisa ser um trecho do título.");
      }
      optionalMedia(errors, d.media, "hero.media");
      return;
    }
    case "urgency": {
      text(errors, d.label, "urgency.label", L.urgency_label, true);
      text(errors, d.note, "urgency.note", L.urgency_label, false);
      if (variant === "countdown" && !str(d.ends_at)) {
        errors.push("urgency.ends_at é obrigatório na contagem regressiva (só com data real).");
      } else if (str(d.ends_at) && !validIso(d.ends_at)) {
        errors.push("urgency.ends_at precisa ser uma data válida.");
      }
      return;
    }
    case "deliverables": {
      text(errors, d.title, "deliverables.title", L.section_title, true);
      const max = variant === "numbers" ? V3_MAX.numbers : V3_MAX.deliverables;
      const items = list(errors, d.items, "deliverables.items", 1, max);
      items?.forEach((it, i) => {
        text(errors, it.title, `deliverables.items[${i}].title`, L.item_title, true);
        text(errors, it.description, `deliverables.items[${i}].description`, L.item_desc, false);
        optionalMedia(errors, it.media, `deliverables.items[${i}].media`);
      });
      return;
    }
    case "audience": {
      text(errors, d.title, "audience.title", L.section_title, true);
      const items = Array.isArray(d.items) ? d.items : null;
      if (!items) errors.push("audience.items precisa ser uma lista.");
      else {
        if (items.length < 1) errors.push("audience.items precisa de pelo menos 1 item.");
        if (items.length > V3_MAX.audience) errors.push(`audience.items aceita no máximo ${V3_MAX.audience} itens.`);
        items.forEach((it, i) => text(errors, it, `audience.items[${i}]`, L.item_desc, true));
      }
      if (d.not_items !== undefined) {
        if (!Array.isArray(d.not_items)) errors.push("audience.not_items precisa ser uma lista.");
        else {
          if (d.not_items.length > V3_MAX.not_for) errors.push(`audience.not_items aceita no máximo ${V3_MAX.not_for} itens.`);
          d.not_items.forEach((it, i) => text(errors, it, `audience.not_items[${i}]`, L.item_desc, true));
        }
      }
      return;
    }
    case "proof": {
      text(errors, d.title, "proof.title", L.section_title, true);
      if (variant === "video") {
        const v = (typeof d.video === "object" && d.video !== null ? d.video : {}) as Rec;
        if (!VIDEO_PROVIDERS.includes(v.provider as string) || !str(v.id)) {
          errors.push("proof.video precisa de um link de YouTube ou Vimeo válido.");
        }
        optionalMedia(errors, v.poster, "proof.video.poster");
        text(errors, v.name, "proof.video.name", L.person, true);
        text(errors, v.detail, "proof.video.detail", L.person, false);
        text(errors, v.quote, "proof.video.quote", L.quote, true);
      } else if (variant === "prints") {
        const prints = list(errors, d.prints, "proof.prints", 1, V3_MAX.prints);
        prints?.forEach((p, i) => media(errors, p, `proof.prints[${i}]`));
      } else {
        const cards = list(errors, d.cards, "proof.cards", 1, V3_MAX.proof_cards);
        cards?.forEach((c, i) => {
          text(errors, c.name, `proof.cards[${i}].name`, L.person, true);
          text(errors, c.detail, `proof.cards[${i}].detail`, L.person, false);
          text(errors, c.quote, `proof.cards[${i}].quote`, L.quote, true);
        });
      }
      return;
    }
    case "gallery": {
      text(errors, d.title, "gallery.title", L.section_title, true);
      const items = list(errors, d.items, "gallery.items", V3_GALLERY_MIN, V3_MAX.gallery);
      items?.forEach((it, i) => media(errors, it, `gallery.items[${i}]`));
      return;
    }
    case "about": {
      text(errors, d.title, "about.title", L.section_title, true);
      text(errors, d.name, "about.name", L.person, true);
      text(errors, d.role, "about.role", L.person, false);
      text(errors, d.text, "about.text", L.long_text, true);
      optionalMedia(errors, d.media, "about.media");
      return;
    }
    case "schedule": {
      text(errors, d.title, "schedule.title", L.section_title, true);
      const items = list(errors, d.items, "schedule.items", 1, V3_MAX.schedule);
      items?.forEach((it, i) => {
        text(errors, it.label, `schedule.items[${i}].label`, L.item_label, true);
        text(errors, it.title, `schedule.items[${i}].title`, L.item_title, true);
        text(errors, it.description, `schedule.items[${i}].description`, L.item_desc, false);
      });
      return;
    }
    case "why_free":
    case "after_signup": {
      text(errors, d.title, `${type}.title`, L.section_title, true);
      text(errors, d.text, `${type}.text`, L.short_text, true);
      return;
    }
    case "cta_band": {
      text(errors, d.title, "cta_band.title", L.section_title, true);
      text(errors, d.note, "cta_band.note", L.item_desc, false);
      return;
    }
    case "faq": {
      text(errors, d.title, "faq.title", L.section_title, true);
      const items = list(errors, d.items, "faq.items", 1, V3_MAX.faq);
      items?.forEach((it, i) => {
        text(errors, it.q, `faq.items[${i}].q`, L.faq_q, true);
        text(errors, it.a, `faq.items[${i}].a`, L.faq_a, true);
      });
      return;
    }
  }
}

/** Valida o content v3 vindo do editor. Retorna erros legíveis (vazio = ok). */
export function validateContentV3(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return ["content inválido."];
  const c = input as Rec;

  if (c.schema_version !== 3) errors.push("schema_version precisa ser 3.");
  if (!isTemplateKey(c.template)) errors.push("template desconhecido.");
  if (!(LP_DIRECTIONS as readonly string[]).includes(c.direction as string)) {
    errors.push(`direction precisa ser uma de: ${LP_DIRECTIONS.join(", ")}.`);
  }
  text(errors, c.store_name, "store_name", V3_LIMITS.store_name, true);
  text(errors, c.cta, "cta", V3_LIMITS.cta, true);
  if (!str(c.brand_color) || !parseHex(c.brand_color)) {
    errors.push("brand_color precisa ser um hex válido (#rrggbb).");
  }
  optionalMedia(errors, c.logo, "logo");

  if (!Array.isArray(c.sections)) {
    errors.push("sections precisa ser uma lista.");
    return errors;
  }

  const seen = new Set<string>();
  let heroOn = false;
  c.sections.forEach((raw, i) => {
    const s = (typeof raw === "object" && raw !== null ? raw : {}) as Rec;
    if (!isSectionType(s.type)) {
      errors.push(`sections[${i}].type desconhecido.`);
      return;
    }
    if (seen.has(s.type)) {
      errors.push(`sections[${i}]: seção ${s.type} repetida.`);
      return;
    }
    seen.add(s.type);
    if (!isVariantOf(s.type, s.variant)) {
      errors.push(`${s.type}.variant inválida.`);
    }
    const enabled = SECTION_CATALOG[s.type].required ? true : s.enabled === true;
    if (s.type === "hero") heroOn = true;
    // Seção desligada não bloqueia: o lojista desliga justamente pra não precisar
    // preencher. Ela só volta a ser validada quando ligar de novo.
    if (enabled) validateSectionData(errors, s);
  });
  if (!heroOn) errors.push("hero é obrigatório.");

  return errors;
}

/* ---------------------------- sanitização ---------------------------- */

function optText(v: unknown): string | undefined {
  return str(v) ? v.trim() : undefined;
}

function reqText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optMedia(v: unknown): LpMediaRef | null {
  return typeof v === "object" && v !== null ? toMediaRef(v) : null;
}

function strings(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter(str).map((s) => s.trim()).slice(0, max) : [];
}

function objects(v: unknown, max: number): Rec[] {
  return Array.isArray(v)
    ? v.filter((x): x is Rec => typeof x === "object" && x !== null).slice(0, max)
    : [];
}

function withOpt<T extends object>(base: T, extras: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extras)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Vídeo do depoimento: só provider/id conhecidos; poster e detalhe são opcionais. */
function sanitizeProofVideo(raw: unknown): ProofVideo | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const v = raw as Rec;
  if (!VIDEO_PROVIDERS.includes(v.provider as string) || !str(v.id)) return undefined;
  return withOpt(
    { provider: v.provider as LpVideoProvider, id: v.id.trim(), name: reqText(v.name), quote: reqText(v.quote) },
    { detail: optText(v.detail), poster: v.poster ? toMediaRef(v.poster) : undefined },
  );
}

function sanitizeData(type: LpSectionType, variant: string, raw: unknown): LpSection["data"] {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Rec;
  switch (type) {
    case "hero":
      return withOpt(
        { headline: reqText(d.headline), description: reqText(d.description), media: optMedia(d.media) },
        { badge: optText(d.badge), highlight: optText(d.highlight) },
      );
    case "urgency":
      return withOpt({ label: reqText(d.label) }, { ends_at: optText(d.ends_at), note: optText(d.note) });
    case "deliverables":
      return {
        title: reqText(d.title),
        items: objects(d.items, variant === "numbers" ? V3_MAX.numbers : V3_MAX.deliverables).map((it) =>
          withOpt({ title: reqText(it.title) }, { description: optText(it.description), media: it.media ? optMedia(it.media) : undefined }),
        ),
      };
    case "audience":
      return withOpt(
        { title: reqText(d.title), items: strings(d.items, V3_MAX.audience) },
        { not_items: d.not_items === undefined ? undefined : strings(d.not_items, V3_MAX.not_for) },
      );
    case "proof":
      return withOpt(
        {
          title: reqText(d.title),
          prints: objects(d.prints, V3_MAX.prints).map(toMediaRef),
          cards: objects(d.cards, V3_MAX.proof_cards).map((c) =>
            withOpt({ name: reqText(c.name), quote: reqText(c.quote) }, { detail: optText(c.detail) }),
          ),
        },
        { video: sanitizeProofVideo(d.video) },
      );
    case "gallery":
      return { title: reqText(d.title), items: objects(d.items, V3_MAX.gallery).map(toMediaRef) };
    case "about":
      return withOpt(
        { title: reqText(d.title), name: reqText(d.name), text: reqText(d.text), media: optMedia(d.media) },
        { role: optText(d.role) },
      );
    case "schedule":
      return {
        title: reqText(d.title),
        items: objects(d.items, V3_MAX.schedule).map((it) =>
          withOpt({ label: reqText(it.label), title: reqText(it.title) }, { description: optText(it.description) }),
        ),
      };
    case "why_free":
    case "after_signup":
      return { title: reqText(d.title), text: reqText(d.text) };
    case "cta_band":
      return withOpt({ title: reqText(d.title) }, { note: optText(d.note) });
    case "faq":
      return {
        title: reqText(d.title),
        items: objects(d.items, V3_MAX.faq).map((it) => ({ q: reqText(it.q), a: reqText(it.a) })),
      };
  }
}

/**
 * Normaliza pro shape exato: reordena as seções pela ordem do template, descarta
 * tipo desconhecido ou repetido, força `enabled` nas obrigatórias, cai na variante
 * padrão do template quando a enviada não existe e completa as seções que o
 * client omitiu (desligadas, vazias). Assume input já aprovado por
 * `validateContentV3`.
 */
export function toContentV3(input: Record<string, unknown>): LpContentV3 {
  const template = TEMPLATES_V3[input.template as LpTemplateKey];
  const byType = new Map<LpSectionType, Rec>();
  for (const raw of Array.isArray(input.sections) ? input.sections : []) {
    const s = (typeof raw === "object" && raw !== null ? raw : {}) as Rec;
    if (isSectionType(s.type) && !byType.has(s.type)) byType.set(s.type, s);
  }

  const sections = template.sections.map((preset): LpSection => {
    const s = byType.get(preset.type);
    const variant = s && isVariantOf(preset.type, s.variant) ? (s.variant as string) : preset.variant;
    const enabled = SECTION_CATALOG[preset.type].required ? true : Boolean(s?.enabled);
    const data = s ? sanitizeData(preset.type, variant, s.data) : emptySectionData(preset.type);
    return { type: preset.type, variant, enabled, data } as LpSection;
  });

  const logo = input.logo ? toMediaRef(input.logo) : null;
  return {
    schema_version: 3,
    template: template.key,
    direction: (LP_DIRECTIONS as readonly string[]).includes(input.direction as string)
      ? (input.direction as LpDirection)
      : template.direction,
    store_name: reqText(input.store_name),
    logo,
    brand_color: reqText(input.brand_color),
    cta: reqText(input.cta),
    sections,
  };
}

/* ------------------------------ leitura ------------------------------ */

export function findSection<T extends LpSectionType>(content: LpContentV3, type: T): SectionOf<T> | null {
  const s = content.sections.find((x) => x.type === type);
  return s ? (s as SectionOf<T>) : null;
}

/** Dimensões gravadas na página e na captura: o que a pessoa viu. */
export function contentDimensions(content: LpContentV3): {
  structure: LpTemplateKey;
  visualDirection: LpDirection;
  modelVersion: number;
} {
  return { structure: content.template, visualDirection: content.direction, modelVersion: 1 };
}

/** Título, descrição e imagem de compartilhamento (metadata / kit de divulgação). */
export function contentSummary(content: LpContentV3): {
  headline: string;
  description: string;
  ogImage: LpMediaRef | null;
} {
  const hero = findSection(content, "hero");
  return {
    headline: hero?.data.headline ?? content.store_name,
    description: hero?.data.description ?? "",
    ogImage: hero?.data.media ?? content.logo ?? null,
  };
}
