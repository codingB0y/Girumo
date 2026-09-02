/**
 * Páginas v3 — catálogo de seções (Girumo LP).
 *
 * Uma página v3 é uma LISTA de seções na ordem que o template define. O lojista
 * liga/desliga as opcionais e troca a variante de cada uma; nunca reordena (spec
 * de 14/07: layout protegido). Este módulo é só tipos + catálogo + limites — a
 * validação vive em `content-v3.ts` e os presets em `templates-v3.ts`.
 */

import type { LpMediaRef, LpVideoRef } from "./content";

export const LP_DIRECTIONS = ["editorial", "impacto", "vitrine"] as const;
export type LpDirection = (typeof LP_DIRECTIONS)[number];

export const SECTION_TYPES = [
  "hero",
  "urgency",
  "deliverables",
  "audience",
  "proof",
  "gallery",
  "about",
  "schedule",
  "why_free",
  "after_signup",
  "cta_band",
  "faq",
] as const;
export type LpSectionType = (typeof SECTION_TYPES)[number];

/** Limites de caracteres (contrato com o editor: contador + `maxLength`). */
export const V3_LIMITS = {
  store_name: 60,
  cta: 32,
  badge: 30,
  headline: 90,
  highlight: 40,
  description: 200,
  section_title: 80,
  item_title: 60,
  item_desc: 120,
  item_label: 24,
  short_text: 300,
  long_text: 400,
  person: 60,
  quote: 180,
  urgency_label: 80,
  faq_q: 120,
  faq_a: 400,
} as const;

export const V3_MAX = {
  deliverables: 6,
  numbers: 4,
  audience: 6,
  not_for: 4,
  prints: 6,
  proof_cards: 3,
  gallery: 6,
  schedule: 6,
  faq: 6,
} as const;

/** Galeria abaixo disso não é galeria — mesma regra da editorial v2 (`GALLERY_MIN`). */
export const V3_GALLERY_MIN = 2;

/* ------------------------------- dados ------------------------------- */

export type HeroData = {
  badge?: string;
  headline: string;
  /** Trecho do título destacado na cor da marca (precisa existir dentro do headline). */
  highlight?: string;
  description: string;
  media: LpMediaRef | null;
};

export type UrgencyData = {
  label: string;
  /** ISO 8601. Obrigatório na variante `countdown`; a contagem só existe com data real. */
  ends_at?: string;
  note?: string;
};

export type ListItem = { title: string; description?: string; media?: LpMediaRef | null };
export type DeliverablesData = { title: string; items: ListItem[] };

export type AudienceData = { title: string; items: string[]; not_items?: string[] };

export type ProofCard = { name: string; detail?: string; quote: string };
/** Depoimento em vídeo (variante `video`): o embed + quem fala. Migra o `proof` da editorial v2. */
export type ProofVideo = LpVideoRef & { name: string; detail?: string; quote: string };
export type ProofData = { title: string; prints: LpMediaRef[]; cards: ProofCard[]; video?: ProofVideo };

/** Fotos das peças (2–6). O `alt` de cada uma vira a legenda. */
export type GalleryData = { title: string; items: LpMediaRef[] };

export type AboutData = {
  title: string;
  name: string;
  role?: string;
  text: string;
  media: LpMediaRef | null;
};

export type ScheduleItem = { label: string; title: string; description?: string };
export type ScheduleData = { title: string; items: ScheduleItem[] };

export type TextBlockData = { title: string; text: string };
export type CtaBandData = { title: string; note?: string };
export type FaqData = { title: string; items: { q: string; a: string }[] };

/* ------------------------------ seções ------------------------------- */

type Section<T extends LpSectionType, V extends string, D> = {
  type: T;
  variant: V;
  enabled: boolean;
  data: D;
};

export type HeroSection = Section<"hero", "form", HeroData>;
export type UrgencySection = Section<"urgency", "top_bar" | "date_badge" | "countdown", UrgencyData>;
export type DeliverablesSection = Section<
  "deliverables",
  "checklist" | "photo_cards" | "numbers",
  DeliverablesData
>;
export type AudienceSection = Section<"audience", "pain_cards" | "for_not_for", AudienceData>;
export type ProofSection = Section<"proof", "prints" | "cards" | "video", ProofData>;
export type GallerySection = Section<"gallery", "grid", GalleryData>;
export type AboutSection = Section<"about", "single", AboutData>;
export type ScheduleSection = Section<"schedule", "days" | "steps" | "rules", ScheduleData>;
export type WhyFreeSection = Section<"why_free", "card", TextBlockData>;
export type AfterSignupSection = Section<"after_signup", "notice", TextBlockData>;
export type CtaBandSection = Section<"cta_band", "band", CtaBandData>;
export type FaqSection = Section<"faq", "accordion", FaqData>;

export type LpSection =
  | HeroSection
  | UrgencySection
  | DeliverablesSection
  | AudienceSection
  | ProofSection
  | GallerySection
  | AboutSection
  | ScheduleSection
  | WhyFreeSection
  | AfterSignupSection
  | CtaBandSection
  | FaqSection;

export type SectionOf<T extends LpSectionType> = Extract<LpSection, { type: T }>;
export type VariantOf<T extends LpSectionType> = SectionOf<T>["variant"];

/* ----------------------------- catálogo ------------------------------ */

export type SectionMeta = {
  label: string;
  /** Uma linha: por que a seção existe. Aparece no editor ao lado do switch. */
  why: string;
  required: boolean;
  variants: { key: string; label: string }[];
};

export const SECTION_CATALOG: Record<LpSectionType, SectionMeta> = {
  hero: {
    label: "Abertura",
    why: "A promessa e o formulário no mesmo bloco: é onde 70% das pessoas decidem.",
    required: true,
    variants: [{ key: "form", label: "Formulário na abertura" }],
  },
  urgency: {
    label: "Data e urgência",
    why: "Dá um motivo pra agir agora. Só com data real.",
    required: false,
    variants: [
      { key: "date_badge", label: "Selo de data" },
      { key: "top_bar", label: "Barra no topo" },
      { key: "countdown", label: "Contagem regressiva" },
    ],
  },
  deliverables: {
    label: "O que você recebe",
    why: "Torna o grupo concreto: o que chega, quando, com que vantagem.",
    required: false,
    variants: [
      { key: "checklist", label: "Lista com check" },
      { key: "photo_cards", label: "Cards com foto" },
      { key: "numbers", label: "Faixa de números" },
    ],
  },
  audience: {
    label: "Para quem é",
    why: "A pessoa se reconhece na dor e segue lendo.",
    required: false,
    variants: [
      { key: "pain_cards", label: "Cards de dor" },
      { key: "for_not_for", label: "É pra você / não é" },
    ],
  },
  proof: {
    label: "Prova social",
    why: "Print de conversa é a prova que mais converte no Brasil.",
    required: false,
    variants: [
      { key: "prints", label: "Prints de WhatsApp" },
      { key: "cards", label: "Depoimentos em card" },
      { key: "video", label: "Depoimento em vídeo" },
    ],
  },
  gallery: {
    label: "Galeria de peças",
    why: "Mostra o produto antes de pedir o número: quem vê a arara entra no grupo.",
    required: false,
    variants: [{ key: "grid", label: "Grade de fotos" }],
  },
  about: {
    label: "Quem está por trás",
    why: "Foto e história curta: autoridade sem discurso.",
    required: false,
    variants: [{ key: "single", label: "Uma pessoa" }],
  },
  schedule: {
    label: "Programação",
    why: "Reduz a incerteza: o que acontece, em que dia, em que ordem.",
    required: false,
    variants: [
      { key: "days", label: "Por dia" },
      { key: "steps", label: "Passo a passo" },
      { key: "rules", label: "Regras do grupo" },
    ],
  },
  why_free: {
    label: "Por que é gratuito",
    why: "Mata a desconfiança de quem acha que tem pegadinha.",
    required: false,
    variants: [{ key: "card", label: "Card curto" }],
  },
  after_signup: {
    label: "O que acontece depois",
    why: "Explica o grupo do WhatsApp antes da pessoa cair nele.",
    required: false,
    variants: [{ key: "notice", label: "Aviso em destaque" }],
  },
  cta_band: {
    label: "Faixa de chamada",
    why: "Recolhe quem já decidiu no meio da página, com a mesma frase do botão.",
    required: false,
    variants: [{ key: "band", label: "Bloco de cor" }],
  },
  faq: {
    label: "Perguntas frequentes",
    why: "As objeções que sobraram, respondidas antes de a pessoa perguntar.",
    required: false,
    variants: [{ key: "accordion", label: "Acordeão" }],
  },
};

export function isSectionType(value: unknown): value is LpSectionType {
  return typeof value === "string" && (SECTION_TYPES as readonly string[]).includes(value);
}

export function isVariantOf(type: LpSectionType, variant: unknown): boolean {
  return (
    typeof variant === "string" &&
    SECTION_CATALOG[type].variants.some((v) => v.key === variant)
  );
}

/** Dado vazio de cada tipo — usado quando o template desliga a seção e ela ainda não tem conteúdo. */
export function emptySectionData(type: LpSectionType): LpSection["data"] {
  switch (type) {
    case "hero":
      return { headline: "", description: "", media: null };
    case "urgency":
      return { label: "" };
    case "deliverables":
      return { title: "", items: [] };
    case "audience":
      return { title: "", items: [] };
    case "proof":
      return { title: "", prints: [], cards: [] };
    case "gallery":
      return { title: "", items: [] };
    case "about":
      return { title: "", name: "", text: "", media: null };
    case "schedule":
      return { title: "", items: [] };
    case "why_free":
    case "after_signup":
      return { title: "", text: "" };
    case "cta_band":
      return { title: "" };
    case "faq":
      return { title: "", items: [] };
  }
}
